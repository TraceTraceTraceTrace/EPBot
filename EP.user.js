// ==UserScript==
// @name         Auto WebSocket Connect with Price Fetching
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Automatically connect to WebSocket and fetch real prices
// @author       You
// @match        file:///C:/Users/Trace/Documents/Code/commissionCalculator/reference.html
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
    'use strict';

    let websocket = null;
    const reconnectDelay = 5000; // Delay before reconnecting in ms

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
                    // Special handling for employee price which might be in a different format
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

                        // Find the product-info div
                        const productInfo = doc.querySelector('.product-info.mb-4');
                        if (!productInfo) {
                            throw new Error('Product info section not found');
                        }

                        // Extract all information
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

                        // Parse numeric values
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
                    const errorResponse = {
                        error: "Failed to fetch price information",
                        SKU: requestedSku
                    };
                    websocket.send(JSON.stringify(errorResponse));
                    reject(error);
                }
            });
        });
    }

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

                websocket.send(JSON.stringify(response));
                console.log("Sent price information:", response);
            } catch (error) {
                console.error("Error processing request:", error);
                const errorResponse = {
                    SKU: event.data,
                    error: error.message
                };
                websocket.send(JSON.stringify(errorResponse));
            }
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