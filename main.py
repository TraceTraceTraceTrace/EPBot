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

# WAY TO GET AROUND WSS - go through all important domains like productstation and allow insecure in edge settings

# TO DO
# add loop to check if connected to websocket to reconnect
# add loop to do ping/pong stuff

# potentially use realSKU.har.html to generate screenshots of mystation DO THIS LAST

# STUPID ahhhhh ssl certificate i need a domain name and shii. i do this later

# if websocket server receives price and there is active interaction (someone is waiting for price check), edit the interaction message with the price
# if websocket server receives price but there is no active interaction, ignore. i think this is what will happen when there are multiple clients for redundancy.

# need to store all clients in list or something then interate through list when sending messages to client
# otherwise, client variable only points to most recently connected client

# global variables because... i dont feel like typing why, they're important though
active_websocket = None
active_interaction = None

@tree.command(
    name="ep",
    description="Check EP from SKU"
)
@app_commands.describe(sku="Enter SKU")
async def ep(interaction: discord.Interaction, sku: str):
    global active_interaction
    active_interaction = interaction
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

# This relays all messages to the 061 Off the Clock Discord server
@client.event
async def on_message(message: discord.Message):
    if message.author.id == AUTHORID and message.channel.id == 1334861823094161461:
        lounge: discord.abc.GuildChannel = await client.fetch_channel(1335091169213812919) # REPLACE WITH REAL LOUNGE ID
        await lounge.send(message.content)

async def response(websocket):
    global active_websocket
    active_websocket = websocket  # Store the connection globally
    try:
        print("WebSocket connected")
        while True:
            message = await websocket.recv() # Receive the message from the client
            print("MESSAGE RECEIVED: "+message)
            if active_interaction:
                await active_interaction.edit_original_response(content=message)
                
    except websockets.exceptions.ConnectionClosed:
        print("Connection closed.")

async def serve():
    print('Running WebSocket server at ws://0.0.0.0:6232')
    server = await websockets.serve(response, '0.0.0.0', 6232)
    await server.wait_closed()

# Main function that runs both the Discord bot and the WebSocket server concurrently
async def main():
    #websocket_task = asyncio.create_task(serve())  # Start WebSocket server
    asyncio.create_task(serve())  # Start WebSocket server
    await client.start(TOKEN)  # Run the Discord bot (this will block until it exits)

if __name__ == "__main__":
    print(f"Starting Discord Bot and WebSocket Server!")
    asyncio.run(main())  # Run both the WebSocket server and Discord bot in the same asyncio event loop