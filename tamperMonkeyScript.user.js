// ==UserScript==
// @name         EP
// @namespace    http://tampermonkey.net/
// @version      2024-12-13
// @description  highlight sku and press EP
// @author       You
// @include      @https://productstation.microcenter.com
// @icon         https://www.google.com/s2/favicons?sz=64&domain=microcenter.com
// @grant        GM_xmlhttpRequest
// ==/UserScript==



/*
Juan, this is the script that is currently on the computers at work that lets you check EP.
we just need to take the GM.xmlHttpRequest() function from this code and add the websocket code and stuff
also, the code is terrible. it just reads the responses html as a string. we should load it as a DOM object and use an xpath to parse out just the EP price.
the unfortunate part about this code is that we can't really test if it actually works unless we run it on the computers at work
*/




(function() {
    'use strict';

    if (window.location.href.startsWith("https://productstation.microcenter.com/")) {
    }
    document.addEventListener('keydown', function(event) {
        // Alt + C keybind
        if (event.altKey && event.key == 'z' && window.getSelection()) {
            const selection = window.getSelection().toString()

            // if string starts with 6 digits
            const regex = new RegExp('^\\d{6}.*');
            console.log(regex.test(selection))
            if(!regex.test(selection)) {
                return;
            }


            GM.xmlHttpRequest({
                method: "POST",
                url: "https://mcic.microcenter.com/mystation/wish-list/",
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "accept-language": "en-US,en;q=0.9",
                    "cache-control": "max-age=0",
                    "content-type": "application/x-www-form-urlencoded",
                    "sec-ch-ua": "\"Microsoft Edge\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "same-origin",
                    "sec-fetch-user": "?1",
                    "upgrade-insecure-requests": "1"
                },
                referrer: "https://mcic.microcenter.com/mystation/wish-list/",
                referrerPolicy: "strict-origin-when-cross-origin",
                data: "sku="+selection.substring(0, 6)+"&storeId=61&submit=Get+Product+Info",
                onload: function(response) {
                    // Handle the response here
                    let text=response.responseText
                    console.log(text);

                    const itemIndex = text.indexOf("Item:</strong> ")

                    const retailIndex = text.indexOf("Retail Price:</strong> ")
                    text = text.substring(retailIndex).replace("</strong>","")
                    let retailPrice = text.substring(0, text.indexOf("<"))
                    retailPrice = retailPrice.substring(retailPrice.indexOf("$") + 1)

                    const employeeIndex = text.indexOf("Employee Price: $")
                    text = text.substring(employeeIndex)
                    let employeePrice = text.substring(0, text.indexOf("<"))
                    employeePrice = employeePrice.substring(employeePrice.indexOf("$") + 1)

                    alert(`Retail Price: ${retailPrice}\nEmployee Price: ${employeePrice}\nDiscount: ${Math.round((1-(employeePrice/retailPrice))*100) || 0}% off`)
                },
                onerror: function(error) {
                    // Handle errors here
                    console.error("Error:", error);
                },
                credentials: "include"
            });



        }
    });
})();