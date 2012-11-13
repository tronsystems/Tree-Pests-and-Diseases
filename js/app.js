/**  DATABASE FUNCTIONS */
function getDb()
{
	return window.openDatabase("SubmitQueue", "1.0", "SubmitQueue", 200000);
}
function setupLocalStorage()
{
	 var db = getDb();
     db.transaction(populateDB, errorCBSetup, successCB);
}

//Storage setup error callback
//
function errorCBSetup(err) {
	console.log("Error processing SQL: "+err.code);
	//Let the user know that we can't store anything so they will need to be online to use the app
	alert("No local storage available - submission of sighting reports is only available when a network connection is detected.");
}

// Populate the database 
//
function populateDB(tx) {
    tx.executeSql('CREATE TABLE IF NOT EXISTS QUEUE (id INTEGER PRIMARY KEY, data)');
    tx.executeSql('CREATE TABLE IF NOT EXISTS COUNTS (id INTEGER PRIMARY KEY, recorded_count, submitted_count)');
    tx.executeSql('INSERT INTO COUNTS (recorded_count, submitted_count) SELECT 0, 0 WHERE NOT EXISTS (SELECT 1 FROM COUNTS WHERE id = 1)');
}

//Increment the recorded count 
//
function incrementRecordedCount()
{
	console.log("Incrementing recorded count...");
	var db = getDb();
	db.transaction(function(tx){tx.executeSql('UPDATE COUNTS SET recorded_count = recorded_count + 1 WHERE id=1');}, errorCB, successCB);
}
//Increment the submitted count 
//
function incrementSubmittedCount()
{
	console.log("Incrementing submitted count...");
	var db = getDb();
	db.transaction(function(tx){tx.executeSql('UPDATE COUNTS SET submitted_count = submitted_count + 1 WHERE id=1');}, errorCB, successCB);
}

//Get the current counts for display in the form...
function getCurrentCounts()
{
	var db = getDb();
	db.transaction(queryGetCounts, errorCB);
}
//Query the database for stored Count items
//
function queryGetCounts(tx) {
    tx.executeSql('SELECT * FROM COUNTS', [], successCBCounts, errorCB);
}

function successCBCounts(tx, results)
{
	var len = results.rows.length;
    console.log("COUNTS table: " + len + " rows found.");
    if (len>0){
    	console.log("Submitted count: " + results.rows.item(0).submitted_count);
    	console.log("Recorded count: " + results.rows.item(0).recorded_count);
    	$('#counts').html("You have recorded " + results.rows.item(0).recorded_count + " sightings.");
    }
}


// General error callback - log the code
//
function errorCB(err) {
	console.log("Error processing SQL: "+err.code);
}

// Transaction success callback
//
function successCB() {
    //alert("success!");
}
//Local data storage callback
function successCBData() {
    console.log("Data stored locally for later submission");
    incrementRecordedCount();
}

function storeLocal(data)
{
	var db = getDb();
	db.transaction(function(tx){tx.executeSql('INSERT INTO QUEUE (data) VALUES ("' + data + '")');}, errorCB, successCBData);
}

//Remove local entries (called after successful POST)
function deleteLocalEntry(localid)
{
	var db = getDb();
	db.transaction(function(tx){tx.executeSql('DELETE FROM QUEUE WHERE id=' + localid);}, errorCB, successCB);
}

//Query the database for stored Queue items
//
function queryGetQueue(tx) {
    tx.executeSql('SELECT * FROM QUEUE', [], queryQueueSuccess, errorCB);
}

// Query the success callback
//
function queryQueueSuccess(tx, results) {
    var len = results.rows.length;
    console.log("QUEUE table: " + len + " rows found.");
    for (var i=0; i<len; i++){
    	//Submit the data to the server, then delete the entry...
    	submitToServer(results.rows.item(i).data, results.rows.item(i).id);
    }
}

// DEFRERRED SUBMISSION
function submitLocalReports() {
    // Handle the online event
	var db = getDb();
	db.transaction(queryGetQueue, errorCB);
}

/**  END: DATABASE FUNCTIONS */


/**  GPS LOCATION FUNCTIONS */
//onError Callback receives a PositionError object
//
function onGPSError(error) {
	//Carry on without device specified location...
    //alert('code: '    + error.code    + '\n' +
    //     'message: ' + error.message + '\n');
    $.mobile.loading( 'hide' );
    $('#gpslatlng').hide();
	$('#locnname').show();
	$('#locnpcode').show();
}

function onGPSSuccess(position) {
	//alert("Got GPS!");
	$('#locationgpslat').val(position.coords.latitude);
	$('#locationgpslng').val(position.coords.longitude);
	$('#gpslatlng').html("Lat: " + position.coords.latitude + " Lng: " + position.coords.longitude);
	$('#gpslatlng').show();
	$('#locnname').hide();
	$('#locnpcode').hide();
	$.mobile.loading( 'hide' );
}
function getLocnGPS()
{
	showLoading("Getting location...");
	navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError);
}

/**  END: GPS LOCATION FUNCTIONS */

/** FORM HANDLING FUNCTIONS */
function initForm()
{
	//try to get gps location settings
	getLocnGPS();
	getCurrentCounts();
	//populate timestamp with the current date/time
	var dte = new Date();
	$('#datetimereported').val(dte.toString());
	$('#deviceid').val(device.uuid);
}

function storeReport(data) {  
	var networkState = navigator.network.connection.type;
	/*var states = {};
    states[Connection.UNKNOWN]  = 'Unknown connection';
    states[Connection.ETHERNET] = 'Ethernet connection';
    states[Connection.WIFI]     = 'WiFi connection';
    states[Connection.CELL_2G]  = 'Cell 2G connection';
    states[Connection.CELL_3G]  = 'Cell 3G connection';
    states[Connection.CELL_4G]  = 'Cell 4G connection';
    states[Connection.NONE]     = 'No network connection'; */
	
    if (networkState == Connection.NONE)
    {
    	storeLocal(data);
    	$.mobile.changePage('index.html');
    } else {
        submitToServer(data, null);
    }
    return false;
}

function submitToServer(data, localid)
{
	 $.support.cors = true;
     var jqxhr = $.post("http://80.177.75.100/treedisease/TreeDiseaseReport?CreateDocument", data);
     if (localid == null)
     {
    	 //If local id is null, then we are handling a direct submission from the form, process then redirect.
    	 jqxhr.error(function() {storeLocal(data);});
    	 jqxhr.success(function() {incrementRecordedCount();incrementSubmittedCount();console.log("Data submitted to server");});
    	 jqxhr.complete(function() {$.mobile.changePage('index.html');});
     } else {
    	 //We are submitting a locally queued item, so tidy up as required... 
    	 jqxhr.success(function() {
    		 				deleteLocalEntry(localid);
    	 					incrementSubmittedCount();
    	 					console.log("Submitted locally queued item id: " + localid)
    	 					}
    	 );
     }
}

function onPhotoDataFail() {
	console.log("Failed getting image...");
}
function onPhotoDataSuccess(imageData) {
    // Uncomment to view the base64 encoded image data
    // console.log(imageData);

    // Get image handle
    //
    $('#imgPreview').attr("src", "data:image/jpeg;base64," + imageData);
    $('#photo1').val("data:image/jpeg;base64," + imageData);

    // Unhide image elements
    //
    $('#imgPreview').show();
}

function capturePhoto() {
    // Take picture using device camera and retrieve image as base64-encoded string
	//pictureSource=navigator.camera.PictureSourceType;
    var destinationType=navigator.camera.DestinationType;
    navigator.camera.getPicture(onPhotoDataSuccess, onPhotoDataFail, { quality: 50,
      destinationType: destinationType.DATA_URL, targetWidth: 240, targetHeight: 240,
 });
}

function clearForm(form) {
	// Remove field values as required...
	//Clear the image preview...
	$('#imgPreview').attr("src", "");
	$(form).children('option').each(
			function() {
				$(this).removeAttr("selected");
			});
	
	$(form).children().each( 
			  function(){
			    //access to form element via $(this)
				  if ($(this).attr("id") != "contactname" && $(this).attr("id") != "contactemail") {
					  $(this).val("");
				  }
			  }
			);
}
/** END: FORM HANDLING FUNCTIONS */

/** UTILTIY FUNCTIONS */
function showLoading(textMessage)
{
	$.mobile.loading( 'show', {
		text: textMessage,
		textVisible: true,
		theme: 'a',
		html: ""
	});
}

function hideLoading()
{
	$.mobile.loading('hide');
}

// Set external links to ensure that target is _blank, so that iOS will launch them correctly.
function externalizeLinks(baseName)
{
	var expr = 'a[href^=http]';
	if (baseName != "")
	{
		expr = baseName + ' ' + expr;
	}
	jQuery(function($){
		$(expr).each(function() {
			//console.log("checking " + this.href);
			$(this).attr("target", "_blank");
			$(this).attr("rel", "external");
	      	/*$(this).click(function(){
	      		//alert("open external!");
	      		navigator.app.loadUrl(this.href, {wait:2000, loadingDialog:"Please Wait, Loading External Link...", loadUrlTimeoutValue: 60000, openExternal:true } ); 
	      		//window.open(this.href);
	      		return false;
	      	});*/
	    });	
	});
	
}