// ==UserScript==
// @name         Auto WebSocket Connect with Single Connection
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automatically connect to WebSocket on page load with single connection handling
// @author       You
// @match        file:///C:/Users/Trace/Documents/Code/commissionCalculator/reference.html
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    let websocket = null;
    const reconnectDelay = 5000; // Delay before reconnecting in ms

    // Function to handle WebSocket connection
    function connectWebSocket() {
        // Check if we're already connected
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('Already connected to WebSocket server.');
            return;
        }

        websocket = new WebSocket('ws://71.185.48.187:6232');

        websocket.onopen = function() {
            console.log('Connected to WebSocket server.');
        };

        websocket.onmessage = function(event) {
            console.log('Received from WebSocket: ' + event.data);
            websocket.send(`EP for ${event.data} is $${Math.floor(Math.random() * 100) + 1}`);
            console.log("Sent random EP price");
        };

        websocket.onerror = function(error) {
            console.error('WebSocket error: ', error);
        };

        websocket.onclose = function() {
            console.log('WebSocket connection closed.');
            websocket = null;
            // Attempt to reconnect after a delay
            console.log(`Attempting to reconnect in ${reconnectDelay / 1000} seconds...`);
            setTimeout(connectWebSocket, reconnectDelay);
        };
    }

    // Initialize connection when the script loads
    console.log('Initializing WebSocket connection...');
    connectWebSocket();
})();