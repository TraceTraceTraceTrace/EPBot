// ==UserScript==
// @name         WebSocket Connect on Alt+C
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Connect to a WebSocket when Alt+C is pressed
// @author       You
// @match        file:///C:/Users/Trace/Documents/Code/commissionCalculator/reference.html
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let websocket = null;

    // Function to handle WebSocket connection
    function connectWebSocket() {
        if (websocket) {
            console.log('Already connected to the WebSocket.');
        return;
        }

        websocket = new WebSocket('ws://localhost:1234'); // Change this to your WebSocket server URL

        websocket.onopen = function() {
            console.log('Connected to the WebSocket server.');
            // websocket.send('Hello from client!');
        };

        websocket.onmessage = function(event) {
            console.log('Received from WebSocket: ' + event.data);
            websocket.send(`EP for ${event.data} is $${Math.floor(Math.random() * 100) + 1}`);
            console.log(`EP for ${event.data} is $${Math.floor(Math.random() * 100) + 1}`)
        };

        websocket.onerror = function(error) {
            console.error('WebSocket error: ' + error);
        };

        websocket.onclose = function() {
            console.log('WebSocket connection closed.');
            websocket = null;
        };
    }

    // Listen for the Alt + C key combination
    document.addEventListener('keydown', function(event) {
        if (event.altKey && event.key === 'c') {
            console.log('Alt + C pressed');
            connectWebSocket();
        }
    });
})();