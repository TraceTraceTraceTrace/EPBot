import asyncio
import websockets
import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv

# Loads the Discord bot token from a .env file
load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

active_websocket = None

@tree.command(
    name="ep",
    description="Check EP from SKU"
)
@app_commands.describe(sku="Enter SKU")
async def ep(interaction: discord.Interaction, sku: str):
    if not (sku.isdigit() and len(sku) == 6):
        await interaction.response.send_message(f"Please enter a valid SKU")
    else:
        await interaction.response.send_message(f"Checking EP for {sku}...")
        # If the WebSocket is connected, send the valid SKU
        if active_websocket:
            try:
                await active_websocket.send(sku)
                print(f"Sent SKU: {sku} to the WebSocket client.")
            except Exception as error:
                print(f"Error sending SKU: {error}")
        await interaction.response.edit_message("$1000")

# This is the WebSocket response handler.
async def response(websocket):
    global active_websocket
    active_websocket = websocket  # Store the connection globally
    try:
        print("WebSocket connected")
        while True:
            message = await websocket.recv()  # Receive the message from the client
            print(f"Received message: {message}")
            await websocket.send(f"Message received: {message}")  # Send response back to the client
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed.")
    
# WebSocket server function to run the WebSocket server on localhost
async def serve():
    print('Running WebSocket server at ws://localhost:8765')
    server = await websockets.serve(response, 'localhost', 8765)  # Pass the correct handler function
    await server.wait_closed()  # Wait for the server to close

# Main function that runs both the Discord bot and the WebSocket server concurrently
async def main():
    websocket_task = asyncio.create_task(serve())  # Start WebSocket server
    await client.start(TOKEN)  # Run the Discord bot (this will block until it exits)

if __name__ == "__main__":
    print(f"Starting Discord Bot and WebSocket Server!")
    asyncio.run(main())  # Run both the WebSocket server and Discord bot in the same asyncio event loop
