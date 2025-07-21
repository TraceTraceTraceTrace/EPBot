// ==UserScript==
// @name         Micro Center Multi-Script Handler
// @namespace    http://tampermonkey.net/
// @version      0.11
// @description  Runs different scripts based on current URL
// @author       You
// @match        https://orderhistory.microcenter.com/*
// @match        https://productstation.microcenter.com/*
// @updateURL    https://raw.githubusercontent.com/TraceTraceTraceTrace/EPBot/refs/heads/main/EP.user.js
// @downloadURL  https://raw.githubusercontent.com/TraceTraceTraceTrace/EPBot/refs/heads/main/EP.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const url = window.location.href;

    if (url.startsWith("https://orderhistory.microcenter.com")) {
        // === Commission Calculator (Alt + T) ===
        (function() {
    'use strict';

    // Global array so that all pages are added to same array
    const lines = [];
    // map to store all lines so that we can check if already in map
    const bob = new Map();

    // Function to parse the table into a 2D array
    function parseTable() {
        // Get the table by its ID
        const table = document.querySelectorAll('table')[document.querySelectorAll('table').length - 1];

        // Check if the table exists
        if (!table) {
            console.error("Table not found! ");
            return;
        }

        // Get all rows from the table body
        const rows = table.querySelectorAll('tbody .k-table-row');

        // Loop through each row and extract the data
        rows.forEach(row => {
            const columns = row.querySelectorAll('td');
            const rowArray = [];

            // Extract data for each column
            rowArray.push(columns[0].textContent.trim());             // Transaction Number
            rowArray.push(columns[1].textContent.trim());             // Sale Type
            rowArray.push(columns[2].textContent.trim());             // Line
            rowArray.push(columns[3].textContent.trim());             // Sku
            rowArray.push(columns[4].textContent.trim());             // Description
            rowArray.push(parseInt(columns[5].textContent.trim()));   // Qty
            rowArray.push(parsePrice(columns[6].textContent.trim())); // Unit Price
            rowArray.push(parsePrice(columns[7].textContent.trim())); // Total
            rowArray.push(row.classList.contains("sales-group2"));    // isPlan

            // convert array to string so you can add to map
            const rowArrayString = JSON.stringify(rowArray);
            // check if in map, if in map, return, if not, add to map and push to lines
            if (!bob.get(rowArrayString)) {
                // add to map so that we can track
                bob.set(rowArrayString, true);

                // line is new, add to lines. this is all to prevent duplicate lines from being added when reactivating script
                lines.push(rowArray)
            }
        });

        // Log the 2D array to the console (it's pretty)
        //console.table(lines);
    }

    function countTransactions() {
        if (!lines) {
            console.error("lines not found! ");
            return;
        }
        const transactions = new Map();

        lines.forEach(function(line) {
            if (line[1] == "Return" || (line[1] == "Exchange" && parseInt(line[5]) <= 0)) {
                return;
            }

            let transaction = line[0];
            if (transactions.has(transaction)) {
                transactions.set(transaction, transactions.get(transaction) + 1);
            } else {
                transactions.set(transaction, 1);
            }
        });
        //console.log("Customers served: " + transactions.size);
        // console.table(Array.from(transactions));
        return transactions.size;
    }

    // remove everything including period so that value is stored in cents as integer
    function parsePrice(price) {
        price = price.replace('$', '').replace(",", '').replace("(", "").replace(")", "").replace(".", "");

        // Convert the result to a float
        return parseInt(price);
    }

    function formatNumber(num) {
        // Ensure the number has two decimal places
        let formattedNumber = num.toFixed(2);
        // Add commas for thousands
        formattedNumber = Number(formattedNumber).toLocaleString("en", { minimumFractionDigits: 2 });
        return formattedNumber;
    }

    function calculateCommission() {
        if (!lines) {
            console.error("lines not found! ");
            return;
        }

        if (document.getElementById("Commission")) {
            document.getElementById("Commission").remove();
        }

        let plans = 0; //                         10%
        let lessTen = 0; // 0.01 - 9.99           12%
        let lessHundred = 0; // 10 - 99.99        6%
        let lessTwoHundred = 0; // 100 - 199.99   3%
        let moreTwoHundred = 0; // 200 - ∞        2%

        lines.forEach(function(line) {
            const description = line[4];
            const quantity = line[5];
            const unitPrice = line[6];
            const isPlan = line[8];

            if (isPlan) {
                plans += unitPrice * quantity;
            } else if (unitPrice < 10 * 100) {
                lessTen += unitPrice * quantity;
            } else if (unitPrice < 100 * 100) {
                lessHundred += unitPrice * quantity;
            } else if (unitPrice < 200 * 100) {
                lessTwoHundred += unitPrice * quantity;
            } else {
                moreTwoHundred += unitPrice * quantity;
            }
        });

        const totalSales = plans + lessTen + lessHundred + lessTwoHundred + moreTwoHundred;

        // final commission per price range rounded to nearest 2nd place because that's how commission report does it
        const plansComm = parseFloat((plans / 100 * 0.10).toFixed(2))*100;
        const lessTenComm = parseFloat((lessTen / 100 * 0.12).toFixed(2))*100;
        const lessHundredComm = parseFloat((lessHundred / 100 * 0.06).toFixed(2))*100;
        const lessTwoHundredComm = parseFloat((lessTwoHundred / 100 * 0.03).toFixed(2))*100;
        const moreTwoHundredComm = parseFloat((moreTwoHundred / 100 * 0.02).toFixed(2))*100;

        const totalComm = plansComm + lessTenComm + lessHundredComm + lessTwoHundredComm + moreTwoHundredComm;

        const transactions = countTransactions();

        const parent = document.getElementById("SalesSearch");
        const html = `
        <div class="col-1-2" id="Commission" style="float: right;">
            <div class="k-widget k-grid k-grid-md"data-role="grid">
                <table role="grid" class="k-grid-table k-table k-table-md" tabindex="0">
                    <colgroup>
                        <col style="width:150px">
                        <col style="width:80px">
                        <col style="width:100px">
                        <col style="width:100px">
                        <col style="width:110px">
                        <col style="width:90px">
                        <col style="width:90px">
                    </colgroup>
                    <thead role="rowgroup" class="k-grid-header">
                        <tr class="k-table-row" role="row">
                            <th class="k-table-th k-header" role="columnheader" scope="col">&nbsp;</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">Plans (10%)</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">$0.01 - $9.99 (12%)</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">$10 - $99.99 (6%)</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">$100 - $199.99 (3%)</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">$200 - $∞ (2%)</th>
                            <th class="k-table-th k-header" role="columnheader" scope="col">Total</th>
                        </tr>
                    </thead>
                    <tbody class="k-table-tbody" role="rowgroup">
                        <tr class="k-alt k-table-row k-table-alt-row k-master-row sales-group10" role="row">
                            <td class="k-table-td" role="gridcell">Sales</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(plans / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessTen / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessHundred / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessTwoHundred / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(moreTwoHundred / 100)}</td>
                            <td class="k-table-td" role="gridcell" style="font-weight: bold">$${formatNumber(totalSales / 100)}</td>
                        </tr>
                        <tr class="k-table-row k-master-row sales-group11" role="row">
                            <td class="k-table-td" role="gridcell">Commission</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(plansComm / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessTenComm / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessHundredComm / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(lessTwoHundredComm / 100)}</td>
                            <td class="k-table-td" role="gridcell">$${formatNumber(moreTwoHundredComm / 100)}</td>
                            <td class="k-table-td" role="gridcell" style="font-weight: bold">$${formatNumber(totalComm / 100)}</td>
                        </tr>
                    </tbody>
                    <tfoot class="k-grid-footer k-table-tfoot" role="rowgroup">
                        <tr class="k-table-row k-footer-template" role="row">
                            <td role="gridcell">Customers Served: ${transactions}</td>
                            <td role="gridcell">&nbsp;</td>
                            <td role="gridcell">&nbsp;</td>
                            <td role="gridcell">&nbsp;</td>
                            <td role="gridcell">&nbsp;</td>
                            <td role="gridcell">&nbsp;</td>
                            <td role="gridcell">&nbsp;</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>`

        parent.insertAdjacentHTML("beforeend", html);
    }

    // Listen for the keydown event to trigger on Alt + C
    document.addEventListener('keydown', function(event) {
        // Check if the 'Alt' key and 'C' key are pressed simultaneously
        if (event.altKey && event.key == 'j') {
            parseTable();
            calculateCommission()
        }
    });
})();
    }

    else if (window.location.href.startsWith("https://productstation.microcenter.com/")) {

        !function(){"use strict";let e=null,t=!1,i=null,o=null;const n=5e3,r=3e5,c=5;let a=0;function l(e){return parseFloat(e.replace(/[^0-9.]/g,""))}function s(e,t){const i=e.getElementsByTagName("p");for(let e of i){const i=e.querySelector("strong");if(i&&i.textContent.includes(t)){if("Employee Price:"===t){const t=e.textContent.match(/\$[\d,]+\.?\d*/);return t?t[0]:""}return e.textContent.replace(i.textContent,"").trim()}}return""}function u(){a=0,m()}function m(){if(!(t||e&&e.readyState===WebSocket.OPEN)){t=!0,e&&(e.onopen=null,e.onclose=null,e.onerror=null,e.onmessage=null,e.readyState!==WebSocket.OPEN&&e.readyState!==WebSocket.CONNECTING||e.close(),e=null),i&&(clearTimeout(i),i=null),o&&(clearTimeout(o),o=null);try{e=new WebSocket("wss://justgrapemebro.com"),e.onopen=function(){e.send(`Version: ${GM_info.script.version}`),t=!1,a=0,o&&(clearTimeout(o),o=null)},e.onmessage=async function(t){try{const i=await async function(e){return new Promise(((t,i)=>{GM.xmlHttpRequest({method:"POST",url:"https://mcic.microcenter.com/mystation/wish-list/",headers:{accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8","content-type":"application/x-www-form-urlencoded"},data:"sku="+e+"&storeId=61&submit=Get+Product+Info",onload:function(e){try{const i=(new DOMParser).parseFromString(e.responseText,"text/html").querySelector(".product-info.mb-4");if(!i)throw new Error("invalid SKU");const o={sku:s(i,"Sku:"),item:s(i,"Item:"),description:s(i,"Description:"),upc:s(i,"UPC:"),availability:s(i,"Availability:"),location:s(i,"Location in Store:"),retailPrice:s(i,"Retail Price:"),employeePrice:s(i,"Employee Price:")},n={sku:o.sku,item:o.item,description:o.description,upc:o.upc,availability:parseInt(o.availability,10)||0,location:o.location,retailPrice:l(o.retailPrice),employeePrice:l(o.employeePrice)};t(n)}catch(e){i(e)}},onerror:function(e){i(e)}})}))}(t.data),o={SKU:i.sku,Item:i.item,Description:i.description,UPC:i.upc,Availability:i.availability,Location:i.location,RetailPrice:i.retailPrice,EmployeePrice:i.employeePrice};e&&e.readyState===WebSocket.OPEN&&e.send(JSON.stringify(o))}catch(i){if(e&&e.readyState===WebSocket.OPEN){const o={SKU:t.data,error:i.message||"Failed to fetch price information"};e.send(JSON.stringify(o))}}},e.onerror=function(e){t=!1},e.onclose=function(e){t=!1,a<c?(a++,i=setTimeout(m,n)):o=setTimeout(u,r)}}catch(e){t=!1,a<c?(a++,i=setTimeout(m,n)):o=setTimeout(u,r)}}}m()}();
        // === Manual SKU Lookup (Alt + Z) ===
        (function() {
    'use strict';

    if (window.location.href.startsWith("https://productstation.microcenter.com/")) {
    }
    document.addEventListener('keydown', function(event) {
        // Alt + C keybind
        if (event.altKey && event.key == 'j' && window.getSelection()) {
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
                    text = text.substring(retailIndex).replace("</strong>","").replace(",","")
                    let retailPrice = text.substring(0, text.indexOf("<"))
                    retailPrice = retailPrice.substring(retailPrice.indexOf("$") + 1)

                    const employeeIndex = text.indexOf("Employee Price: $")
                    text = text.substring(employeeIndex).replace(",","")
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
    }

})();