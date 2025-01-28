import asyncio
import websockets
import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv

# loads the discord bot token from a .env. it's done this way so that the token isn't committed to github
load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

client = discord.Client(intents=intents)

tree = app_commands.CommandTree(client)

#test



@tree.command(
    name="ep",
    description="Check EP from SKU"
)
@app_commands.describe(sku = "Input 6 digit SKU")
async def ep(interaction: discord.Interaction, sku: str):
    await interaction.response.send_message(f"The SKU is: {sku}")


#below code is from this: https://stackoverflow.com/questions/74389045/how-do-i-run-a-websocket-and-discord-py-bot-concurrently
#i think this is how we can run the discord bot code and websocket code in a single file

#async def response(websocket, path):
#    message = await websocket.recv()
#    print(f"[ws server] message  < {message}")

# --- start ---
#async def serve():
#    print('running websockets ws://localhost:8000')
#    server = await websockets.serve(response, 'localhost', 8000)
#    await server.wait_closed()


@client.event
async def on_ready():
    #tree.sync is only needed when adding or modifying slash commands. once the command is created, you can comment it out.
    await tree.sync()
    print(f'Logged in as {client.user}')


if __name__ == "__main__":
    print(f"starting Discord Bot!")
#    asyncio.create_task(serve())  # <-- instead of asyncio.run
    client.run(TOKEN)