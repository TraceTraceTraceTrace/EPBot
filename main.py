"""
Discord Bot with WebSocket Server for SKU Price Checking
Juan, this is the flow of data
1. Receive SKU lookup requests from Discord users
2. Forward these requests to connected WebSocket clients
    Try sending to first available client
    If that fails:
        Try next client in list
        If no more clients, wait for new connections
        If client returns error, remove it and try others
    Keep retrying until either:
        A successful response is received
        The 15-minute timeout is reached
        All clients fail and no new ones connect
3. Process responses and send formatted results back to Discord
"""

import asyncio
import websockets
import discord
from discord import app_commands
import os
from dotenv import load_dotenv
import json
import ssl
import pathlib

# Load environment variables
load_dotenv()
TOKEN = os.getenv('TOKEN')
AUTHORID = int(os.getenv('AUTHORID'))

# Configure SSL for secure WebSocket connections
ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ssl_context.load_cert_chain(
    pathlib.Path(r"C:\Users\Trace\Documents\VENVS\EPBot\domain.cert.pem"),
    keyfile=pathlib.Path(r"C:\Users\Trace\Documents\VENVS\EPBot\private.key.pem")
)

# Set up Discord client with required intents
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

# Global state management
connected_clients = []  # Active WebSocket connections
pending_requests = {}   # SKU requests awaiting responses
client_connected_event = asyncio.Event()  # Signals when a client connects

# WebSocket Message Handling

async def handle_websocket_message(websocket, response):
    """
    Process incoming WebSocket messages containing SKU information.
    
    Args:
        websocket: The WebSocket connection that sent the message
        response: JSON string containing SKU data or error information
    
    The function expects JSON messages with either:
    - Error format: {'error': 'error message', 'SKU': 'sku_number'}
    - Success format: {
        'SKU': 'sku_number',
        'Item': 'item_name',
        'Description': 'description',
        'UPC': 'upc_code',
        'Location': 'location',
        'Availability': 'status',
        'RetailPrice': float,
        'EmployeePrice': float
    }
    """
    print("MESSAGE RECEIVED: " + response)
    
    try:
        data = json.loads(response)
        
        if 'error' in data:
            await handle_error_response(websocket, data)
            return
        else:
            await handle_success_response(data)
        
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        print(f"Invalid JSON received: {response}")
    except Exception as e:
        print(f"Error processing message: {e}")
        print(f"Response received: {response}")

async def handle_error_response(websocket, data):
    """
    Handle error responses from WebSocket clients.
    Removes failed client and attempts to retry with other clients.
    """
    error_sku = data.get('SKU')
    if error_sku in pending_requests:
        interaction = pending_requests[error_sku]
        error_message = f"Error checking SKU {error_sku}: {data['error']}"
        print(error_message)
        
        # Remove failed client and try others
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        await send_message_to_clients(error_sku, interaction)

async def handle_success_response(data):
    """Process successful SKU lookup responses and format Discord messages."""
    try:
        # Get the SKU from the response
        received_sku = None
        for key in ['SKU', 'sku']:
            if key in data:
                received_sku = str(data[key]).strip()
                break
                
        if not received_sku:
            print("Response missing SKU field")
            return
            
        # Check if this response matches a pending request
        if received_sku not in pending_requests:
            print(f"Received response for SKU {received_sku} but it's not in pending requests")
            print(f"Current pending SKUs: {list(pending_requests.keys())}")
            return
            
        # Get the interaction for this request
        interaction = pending_requests[received_sku]
        
        # Format and send response
        formatted_message = format_response_message(data)
        await interaction.edit_original_response(content=formatted_message)
        
        # Remove from pending requests after successful processing
        del pending_requests[received_sku]
        print(f"Processed response for SKU {received_sku}. Remaining requests: {list(pending_requests.keys())}")
        
    except Exception as e:
        print(f"Error processing success response: {e}")
        print(f"Response data: {data}")

def format_response_message(data):
    """Format SKU information for Discord display."""
    # Calculate discount
    retail_price = float(data.get('RetailPrice', 0) or 0)
    employee_price = float(data.get('EmployeePrice', 0) or 0)
    
    discount_percentage = 0
    if retail_price > 0 and employee_price >= 0:
        discount_percentage = ((retail_price - employee_price) / retail_price) * 100

    return (
        f"SKU: {data['SKU']}\n"
        f"Item: {data.get('Item', 'N/A')}\n"
        f"Description: {data.get('Description', 'N/A')}\n"
        f"UPC: {data.get('UPC', 'N/A')}\n"
        f"Location: {data.get('Location', 'N/A')}\n"
        f"Availability: {data.get('Availability', 'N/A')}\n"
        f"Retail Price: ${retail_price:,.2f}\n"
        f"Employee Price: ${employee_price:,.2f}\n"
        f"Discount: {discount_percentage:.1f}%"
    )

# WebSocket Client Management

async def handle_client(websocket):
    """
    Manage individual WebSocket client connections.
    Handles connection lifecycle and message processing.
    """
    connected_clients.append(websocket)
    print(f"Client connected. Current connections: {len(connected_clients)}")
    client_connected_event.set()  # Signal that a client has connected
    
    try:
        async for message in websocket:
            await handle_websocket_message(websocket, message)
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed")
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
            print(f"Client disconnected. Current connections: {len(connected_clients)}.")

async def send_message_to_clients(sku, interaction):
    """
    Distribute SKU lookup requests to connected clients with retry logic.
    Continues trying until a client successfully processes the request or times out.
    """
    pending_requests[sku] = interaction
    print(f"Added SKU {sku} to pending requests. Current requests: {list(pending_requests.keys())}")

    while True:  # Keep trying until success or timeout
        if not connected_clients:
            await interaction.edit_original_response(content=f"Waiting for available client to check {sku}...")
            if not await wait_for_client():
                await interaction.edit_original_response(content="Timed out waiting for client connection")
                del pending_requests[sku]
                return

        # Try each available client
        for websocket in connected_clients:
            try:
                await websocket.send(sku)
                print(f"Successfully sent message to client")
                return
            except websockets.exceptions.ConnectionClosed:
                print(f"Failed to send to client, removing from list")
                connected_clients.remove(websocket)
                continue
        
        if not connected_clients:
            continue

async def wait_for_client(timeout=890):
    """
    Wait for a WebSocket client to connect.
    Returns True if a client connects within the timeout period, False otherwise.
    """
    try:
        await asyncio.wait_for(client_connected_event.wait(), timeout=timeout)
        client_connected_event.clear()
        return True
    except asyncio.TimeoutError:
        return False

# Discord Command Handling

@tree.command(name="ep", description="Check EP from SKU")
@app_commands.describe(sku="Enter SKU")
async def ep(interaction: discord.Interaction, sku: str):
    """
    Discord command handler for SKU lookups.
    Validates input and initiates the lookup process.
    """
    if (interaction.user.id != AUTHORID):
        await interaction.response.send_message("Sorry still testing", ephemeral=True)
        return

    # Validate SKU format (must be 6 digits)
    if not (len(sku) == 6 and all(i in '0123456789' for i in sku)):
        await interaction.response.send_message("Please enter a valid SKU", ephemeral=True)
        return

    # Prevent duplicate requests
    if sku in pending_requests:
        await interaction.response.send_message(
            f"SKU {sku} is already in queue. Please wait for a client to connect.",
            ephemeral=True
        )
        print(f"Rejected duplicate request for SKU {sku}. Current requests: {list(pending_requests.keys())}")
        return

    # Process the request
    await interaction.response.send_message(f"Checking EP for {sku}...")
    try:
        await send_message_to_clients(sku, interaction)
    except Exception as error:
        print(f"Error sending SKU: {error}")
        await interaction.edit_original_response(content=f"Error processing request")
        if sku in pending_requests:
            del pending_requests[sku]

@client.event
async def on_message(message: discord.Message):
    """
    Handle message forwarding between Discord channels.
    """
    if message.author.id == AUTHORID and message.channel.id == 1334861823094161461:
        lounge = await client.fetch_channel(1183880539648819220)
        await lounge.send(message.content)

# --- Server Setup and Main Loop ---

async def serve():
    """Initialize and run the WebSocket server."""
    print('Running WSS server on 0.0.0.0:443')
    async with websockets.serve(handle_client, '0.0.0.0', 443, ssl=ssl_context, origins=None):
        await asyncio.Future()  # run forever

async def main():
    """Main application entry point."""
    try:
        await asyncio.gather(
            serve(),
            client.start(TOKEN)
        )
    except Exception as e:
        print(f"Error details: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("Starting Discord Bot and WSS Server!")
    asyncio.run(main())