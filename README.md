# EPBot
## To do:
ability to check multiple SKUs at once\
show discount percentage\
maybe render a screenshot of mystation, that would be cool\
\
alright gang what we actually gotta do is finish the websocket. this is the way it should be i thinkington. after user uses command, send SKU through websocket, call mystation on client, parse out just price, send back SKU with EP, then edit discord bot message with the price. the tricky part is the connection between the response function and the discord bot message, we need to link them somehow