// ==UserScript==
// @name         Auto WebSocket Connect with Price Fetching
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Automatically connect to WebSocket and fetch real prices
// @author       You
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @updateURL    https://raw.githubusercontent.com/TraceTraceTraceTrace/EPBot/refs/heads/main/EP.user.js
// @downloadURL  https://raw.githubusercontent.com/TraceTraceTraceTrace/EPBot/refs/heads/main/EP.user.js
// ==/UserScript==





// REMEMBER TO INCREASE VERSION NUMBER FOR AUTO UPDATE TO WORK





(function() {
    'use strict';

    let websocket = null;
    let isConnecting = false;
    let reconnectTimeout = null;
    const reconnectDelay = 5000; // Delay before reconnecting in ms
    const maxReconnectAttempts = 5;
    let reconnectAttempts = 0;

    // Function to parse price string to number
    function parsePrice(priceStr) {
        return parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    }

    // Function to find paragraph by strong text content
    function findParagraphByStrongText(container, text) {
        const paragraphs = container.getElementsByTagName('p');
        for (let p of paragraphs) {
            const strong = p.querySelector('strong');
            if (strong && strong.textContent.includes(text)) {
                if (text === 'Employee Price:') {
                    const priceMatch = p.textContent.match(/\$[\d,]+\.?\d*/);
                    return priceMatch ? priceMatch[0] : '';
                }
                return p.textContent.replace(strong.textContent, '').trim();
            }
        }
        return '';
    }

    // Function to fetch prices using real request
    async function fetchPrices(requestedSku) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: "POST",
                url: "https://mcic.microcenter.com/mystation/wish-list/",
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "content-type": "application/x-www-form-urlencoded",
                },
                data: "sku=" + requestedSku + "&storeId=61&submit=Get+Product+Info",
                onload: function(response) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        const productInfo = doc.querySelector('.product-info.mb-4');
                        if (!productInfo) {
                            throw new Error('Product info section not found');
                        }

                        const info = {
                            sku: findParagraphByStrongText(productInfo, 'Sku:'),
                            item: findParagraphByStrongText(productInfo, 'Item:'),
                            description: findParagraphByStrongText(productInfo, 'Description:'),
                            upc: findParagraphByStrongText(productInfo, 'UPC:'),
                            availability: findParagraphByStrongText(productInfo, 'Availability:'),
                            location: findParagraphByStrongText(productInfo, 'Location in Store:'),
                            retailPrice: findParagraphByStrongText(productInfo, 'Retail Price:'),
                            employeePrice: findParagraphByStrongText(productInfo, 'Employee Price:')
                        };

                        const result = {
                            sku: info.sku,
                            item: info.item,
                            description: info.description,
                            upc: info.upc,
                            availability: parseInt(info.availability, 10) || 0,
                            location: info.location,
                            retailPrice: parsePrice(info.retailPrice),
                            employeePrice: parsePrice(info.employeePrice)
                        };

                        resolve(result);
                    } catch (error) {
                        console.error('Error parsing response:', error);
                        reject(error);
                    }
                },
                onerror: function(error) {
                    console.error('Request error:', error);
                    reject(error);
                }
            });
        });
    }

    // Function to clean up existing WebSocket connection
    function cleanupWebSocket() {
        if (websocket) {
            // Remove all event listeners to prevent memory leaks
            websocket.onopen = null;
            websocket.onclose = null;
            websocket.onerror = null;
            websocket.onmessage = null;

            // Close the connection if it's still open
            if (websocket.readyState === WebSocket.OPEN ||
                websocket.readyState === WebSocket.CONNECTING) {
                websocket.close();
            }
            websocket = null;
        }

        // Clear any pending reconnect timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    }

    // Function to handle WebSocket connection
    function connectWebSocket() {
        // Prevent multiple simultaneous connection attempts
        if (isConnecting) {
            console.log('Connection attempt already in progress');
            return;
        }

        // Check if we're already connected
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            console.log('Already connected to WebSocket server.');
            return;
        }

        isConnecting = true;

        // Clean up any existing connection
        cleanupWebSocket();

        const wsOptions = {
            headers: {
                'Connection': 'Upgrade',
                'Upgrade': 'websocket',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Extensions': 'permessage-deflate',
            }
        };

        try {
            websocket = new WebSocket('wss://justgrapemebro.com', [], wsOptions);

            websocket.onopen = function() {
                console.log('Connected to WebSocket server.');
                isConnecting = false;
                reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            };

            websocket.onmessage = async function(event) {
                console.log('Received SKU request: ' + event.data);

                try {
                    const prices = await fetchPrices(event.data);
                    const response = {
                        SKU: prices.sku,
                        Item: prices.item,
                        Description: prices.description,
                        UPC: prices.upc,
                        Availability: prices.availability,
                        Location: prices.location,
                        RetailPrice: prices.retailPrice,
                        EmployeePrice: prices.employeePrice
                    };

                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        websocket.send(JSON.stringify(response));
                        console.log("Sent price information:", response);
                    }
                } catch (error) {
                    console.error("Error processing request:", error);
                    if (websocket && websocket.readyState === WebSocket.OPEN) {
                        const errorResponse = {
                            SKU: event.data,
                            error: error.message || 'Failed to fetch price information'
                        };
                        websocket.send(JSON.stringify(errorResponse));
                    }
                }
            };

            websocket.onerror = function(error) {
                console.error('WebSocket error:', error);
                isConnecting = false;
            };

            websocket.onclose = function(event) {
                console.log('WebSocket connection closed:', event.code, event.reason);
                isConnecting = false;

                // Only attempt to reconnect if we haven't exceeded max attempts
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${reconnectDelay/1000} seconds...`);
                    reconnectTimeout = setTimeout(connectWebSocket, reconnectDelay);
                } else {
                    console.log('Max reconnection attempts reached. Please refresh the page to try again.');
                }
            };

        } catch (error) {
            console.error('Error creating WebSocket:', error);
            isConnecting = false;

            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                reconnectTimeout = setTimeout(connectWebSocket, reconnectDelay);
            }
        }
    }

    // Initialize connection when the script loads
    console.log('Initializing WebSocket connection...');
    connectWebSocket();
})();