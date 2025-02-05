// ==UserScript==
// @name         Auto WebSocket Connect with Price Fetching
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Automatically connect to WebSocket and fetch real prices
// @author       You
// @match        https://productstation.microcenter.com/*
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
    let resetAttemptsTimeout = null;
    const reconnectDelay = 5000; // 5 seconds between reconnect attempts
    const resetDelay = 300000;   // 5 minutes to reset reconnect attempts
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
                        //console.error('Error parsing response:', error);
                        reject(error);
                    }
                },
                onerror: function(error) {
                    //console.error('Request error:', error);
                    reject(error);
                }
            });
        });
    }

    // Function to reset reconnect attempts counter
    function resetReconnectAttempts() {
        reconnectAttempts = 0;
        //console.log('Reconnection attempts counter has been reset');
        // Try to connect immediately after reset
        connectWebSocket();
    }

    // Function to clean up existing WebSocket connection
    function cleanupWebSocket() {
        if (websocket) {
            websocket.onopen = null;
            websocket.onclose = null;
            websocket.onerror = null;
            websocket.onmessage = null;

            if (websocket.readyState === WebSocket.OPEN ||
                websocket.readyState === WebSocket.CONNECTING) {
                websocket.close();
            }
            websocket = null;
        }

        // Clear any pending timeouts
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (resetAttemptsTimeout) {
            clearTimeout(resetAttemptsTimeout);
            resetAttemptsTimeout = null;
        }
    }

    // Function to handle WebSocket connection
    function connectWebSocket() {
        if (isConnecting) {
            //console.log('Connection attempt already in progress');
            return;
        }

        if (websocket && websocket.readyState === WebSocket.OPEN) {
            //console.log('Already connected to WebSocket server.');
            websocket.send(`Version: ${GM_info.script.version}`);
            return;
        }

        isConnecting = true;
        cleanupWebSocket();

        try {
            websocket = new WebSocket('wss://justgrapemebro.com');

            websocket.onopen = function() {
                //console.log('Connected to WebSocket server.');
                isConnecting = false;
                reconnectAttempts = 0; // Reset on successful connection

                // Clear any pending reset timeout on successful connection
                if (resetAttemptsTimeout) {
                    clearTimeout(resetAttemptsTimeout);
                    resetAttemptsTimeout = null;
                }
            };

            websocket.onmessage = async function(event) {
                //console.log('Received SKU request: ' + event.data);

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
                        //console.log("Sent price information:", response);
                    }
                } catch (error) {
                    //console.error("Error processing request:", error);
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
                //console.error('WebSocket error:', error);
                isConnecting = false;
            };

            websocket.onclose = function(event) {
                //console.log('WebSocket connection closed:', event.code, event.reason);
                isConnecting = false;

                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    //console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${reconnectDelay/1000} seconds...`);
                    reconnectTimeout = setTimeout(connectWebSocket, reconnectDelay);
                } else {
                    //console.log(`Max reconnection attempts reached. Will try again in ${resetDelay/1000/60} minutes.`);
                    // Set timeout to reset attempts and try again
                    resetAttemptsTimeout = setTimeout(resetReconnectAttempts, resetDelay);
                }
            };

        } catch (error) {
            //console.error('Error creating WebSocket:', error);
            isConnecting = false;

            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                reconnectTimeout = setTimeout(connectWebSocket, reconnectDelay);
            } else {
                //console.log(`Max reconnection attempts reached. Will try again in ${resetDelay/1000/60} minutes.`);
                resetAttemptsTimeout = setTimeout(resetReconnectAttempts, resetDelay);
            }
        }
    }

    // Initialize connection when the script loads
    //console.log('Initializing WebSocket connection...');
    connectWebSocket();
})();