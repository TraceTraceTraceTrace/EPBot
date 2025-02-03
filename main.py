import asyncio
import websockets
import discord
from discord import app_commands
import os
from dotenv import load_dotenv
import json

# Loads the Discord bot token from a .env file
load_dotenv()
TOKEN = os.getenv('TOKEN')
AUTHORID = int(os.getenv('AUTHORID'))

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

# Store connected WebSocket clients
connected_clients = []

# Dictionary to store pending requests
pending_requests = {}

# Event to signal when a new client connects
client_connected_event = asyncio.Event()

async def handle_websocket_message(websocket, response):
    """Handle incoming WebSocket messages and process them."""
    print("MESSAGE RECEIVED: " + response)
    
    try:
        # Parse the JSON response
        data = json.loads(response)
        
        # Check if this is an error response
        if 'error' in data:
            error_sku = data.get('SKU')
            if error_sku in pending_requests:
                interaction = pending_requests[error_sku]
                # Don't delete from pending_requests yet - let it try other clients
                error_message = f"Error checking SKU {error_sku}: {data['error']}"
                print(error_message)
                # Remove this client from connected_clients so we can try others
                if websocket in connected_clients:
                    connected_clients.remove(websocket)
                # Try sending to another client
                await send_message_to_clients(error_sku, interaction)
            return

        # Normal response processing
        received_sku = data['SKU']
        
        # Check if the received SKU is in our pending requests
        if received_sku not in pending_requests:
            print(f"Received response for SKU {received_sku} but it's not in pending requests")
            print(f"Current pending SKUs: {list(pending_requests.keys())}")
            return
            
        retail_price = float(data['RetailPrice'] or 0)
        employee_price = float(data['EmployeePrice'] or 0)
        
        # Calculate discount percentage only if both prices are valid and retail price is not zero
        if retail_price > 0 and employee_price >= 0:
            discount_percentage = ((retail_price - employee_price) / retail_price) * 100
        else:
            discount_percentage = 0
        
        interaction = pending_requests[received_sku]
        
        # If the SKU in the response doesn't match what we're looking for, send error message
        requested_sku = received_sku  # The SKU we originally requested
        if 'sku' in data and data['sku'] != requested_sku:
            error_message = f"Error: Received information for SKU {data['sku']} when requesting SKU {requested_sku}"
            await interaction.edit_original_response(content=error_message)
            del pending_requests[received_sku]
            return

        formatted_message = (
            f"SKU: {received_sku}\n"
            f"Item: {data.get('Item', 'N/A')}\n"
            f"Description: {data.get('Description', 'N/A')}\n"
            f"UPC: {data.get('UPC', 'N/A')}\n"
            f"Location: {data.get('Location', 'N/A')}\n"
            f"Availability: {data.get('Availability', 'N/A')}\n"
            f"Retail Price: ${retail_price:,.2f}\n"
            f"Employee Price: ${employee_price:,.2f}\n"
            f"Discount: {discount_percentage:.1f}%"
        )
        await interaction.edit_original_response(content=formatted_message)
        del pending_requests[received_sku]
        print(f"Processed response for SKU {received_sku}. Remaining requests: {list(pending_requests.keys())}")
        
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        print(f"Invalid JSON received: {response}")
    except Exception as e:
        print(f"Error processing message: {e}")
        print(f"Response received: {response}")

async def send_message_to_clients(sku, interaction):
    """Send a message to clients with waiting and fallback logic."""
    # Store the interaction before anything else
    pending_requests[sku] = interaction
    print(f"Added SKU {sku} to pending requests. Current requests: {list(pending_requests.keys())}")

    while True:  # Keep trying until we either succeed or timeout
        # If no clients are connected, wait for one
        if not connected_clients:
            await interaction.edit_original_response(content=f"Waiting for available client to check {sku}...")
            if not await wait_for_client():
                await interaction.edit_original_response(content="Timed out waiting for client connection")
                del pending_requests[sku]  # Only remove from pending if we time out
                return

        # Try each client in sequence until one succeeds
        for websocket in connected_clients:
            try:
                await websocket.send(sku)
                print(f"Successfully sent message to client")
                return  # Exit after first successful send
            except websockets.exceptions.ConnectionClosed:
                print(f"Failed to send to client, removing from list")
                connected_clients.remove(websocket)
                continue  # Try next client if available
        
        # If we get here and there are still no clients, loop back to waiting
        if not connected_clients:
            continue


async def wait_for_client(timeout=890):  # 15 minute timeout
    """Wait for a client to connect."""
    try:
        await asyncio.wait_for(client_connected_event.wait(), timeout=timeout)
        client_connected_event.clear()  # Reset the event for next time
        return True
    except asyncio.TimeoutError:
        return False

async def send_message_to_clients(sku, interaction):
    """Send a message to clients with waiting and fallback logic."""
    # Store the interaction before anything else
    pending_requests[sku] = interaction
    print(f"Added SKU {sku} to pending requests. Current requests: {list(pending_requests.keys())}")

    while True:  # Keep trying until we either succeed or timeout
        # If no clients are connected, wait for one
        if not connected_clients:
            await interaction.edit_original_response(content=f"Waiting for available client to check {sku}...")
            if not await wait_for_client():
                await interaction.edit_original_response(content="Timed out waiting for client connection")
                del pending_requests[sku]  # Only remove from pending if we time out
                return

        # Try each client in sequence until one succeeds
        for websocket in connected_clients:
            try:
                await websocket.send(sku)
                print(f"Successfully sent message to client")
                return  # Exit after first successful send
            except websockets.exceptions.ConnectionClosed:
                print(f"Failed to send to client, removing from list")
                connected_clients.remove(websocket)
                continue  # Try next client if available
        
        # If we get here and there are still no clients, loop back to waiting
        if not connected_clients:
            continue

@tree.command(
    name="ep",
    description="Check EP from SKU"
)
@app_commands.describe(sku="Enter SKU")
async def ep(interaction: discord.Interaction, sku: str):
    if (interaction.user.id != AUTHORID):
        await interaction.response.send_message("Sorry still testing", ephemeral = True)
        return

    # Validate SKU format
    if not (sku.isdigit() and len(sku) == 6):
        await interaction.response.send_message("Please enter a valid SKU", ephemeral = True)
        return

    # Check if SKU is already in queue
    if sku in pending_requests:
        await interaction.response.send_message(f"SKU {sku} is already in queue. Please wait for the result.", ephemeral = True)
        print(f"Rejected duplicate request for SKU {sku}. Current requests: {list(pending_requests.keys())}")
        return

    await interaction.response.send_message(f"Checking EP for {sku}...")
    try:
        await send_message_to_clients(sku, interaction)
    except Exception as error:
        print(f"Error sending SKU: {error}")
        await interaction.edit_original_response(content=f"Error processing request: {error}")
        if sku in pending_requests:
            del pending_requests[sku]

@client.event
async def on_message(message: discord.Message):
    if message.author.id == AUTHORID and message.channel.id == 1334861823094161461:
        lounge = await client.fetch_channel(1183880539648819220)
        await lounge.send(message.content)

async def handle_client(websocket):
    """Handle individual WebSocket client connections."""
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

async def serve():
    print('Running WebSocket server at ws://0.0.0.0:6232')
    async with websockets.serve(handle_client, '0.0.0.0', 6232):
        await asyncio.Future()  # run forever

async def main():
    await asyncio.gather(
        serve(),
        client.start(TOKEN)
    )

if __name__ == "__main__":
    print("Starting Discord Bot and WebSocket Server!")
    asyncio.run(main())