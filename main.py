import asyncio
import websockets
import discord
from discord import app_commands
import os
from dotenv import load_dotenv

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
        sku = response.split()[2]  # Split the response and get the SKU
        if sku in pending_requests:
            interaction = pending_requests[sku]
            await interaction.edit_original_response(content=response)
            del pending_requests[sku]
            print(f"Processed response for SKU {sku}. Remaining requests: {list(pending_requests.keys())}")
    except Exception as e:
        print(f"Error processing message: {e}")
        print(f"Response received: {response}")

async def wait_for_client(timeout=300):  # 5 minute timeout
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
        lounge = await client.fetch_channel(1335091169213812919)
        await lounge.send(message.content)

async def handle_client(websocket):
    """Handle individual WebSocket client connections."""
    print("WebSocket connected")
    connected_clients.append(websocket)
    client_connected_event.set()  # Signal that a client has connected
    
    try:
        async for message in websocket:
            await handle_websocket_message(websocket, message)
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed")
    finally:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
            print(f"Client disconnected. Remaining requests: {list(pending_requests.keys())}")

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