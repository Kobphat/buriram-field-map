/* Site switch (edit this one file after deploying the Apps Script back end; see backend/README.md)
   live:false              demo, nothing is sent (until the ethics committee approves)
   live:true, test:true    system test: records saved with test = 1, sign-in works
   live:true               real data collection (after EC approval and ACCEPT = 1 in the script)
   splitTicket             show item 43 only if the EC approves it */
window.SITE_CONFIG = { live: false, test: false, endpoint: "", splitTicket: false };
