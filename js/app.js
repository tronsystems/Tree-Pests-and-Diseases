/**  CONSTANTS  */
//FC
var SUBMIT_TO = "http://www.forestry.gov.uk/website/treedisease.nsf/TreeDiseaseReport?CreateDocument";

//TRON
//var SUBMIT_TO = "http://80.177.75.100/treedisease/TreeDiseaseReport?CreateDocument";
/**  END: CONSTANTS  */


/**  DATABASE FUNCTIONS */
function getDb()
{
	return window.openDatabase("SubmitQueue", "1.0", "SubmitQueue", 200000);
}
function setupLocalStorage()
{
	console.log("Calling getDb...");
	 var db = getDb();
	 if (db == null) {
		 console.log("Null returned for DB");
	 } else {
		 console.log("Got app DB");
	 }
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
    tx.executeSql('DROP TABLE IF EXISTS CONTACT');
    tx.executeSql('CREATE TABLE IF NOT EXISTS CONTACT2 (id INTEGER PRIMARY KEY, contactfirstname, contactsurname, contactemail, contactphone, cancontact)');
    tx.executeSql('INSERT INTO COUNTS (recorded_count, submitted_count) SELECT 0, 0 WHERE NOT EXISTS (SELECT 1 FROM COUNTS WHERE id = 1)');
    tx.executeSql('INSERT INTO CONTACT2 (contactfirstname, contactsurname, contactemail, contactphone, cancontact) SELECT "", "", "", "", "" WHERE NOT EXISTS (SELECT 1 FROM CONTACT2 WHERE id = 1)');
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
//Store the contact details in the form for future use...
function storeContact()
{
	var db = getDb();
	db.transaction(function(tx){tx.executeSql('UPDATE CONTACT2 SET contactfirstname=?, contactsurname=?, contactemail=?, contactphone=?, cancontact=? WHERE id=1', [$('#contactfirstname').val(), $('#contactsurname').val(), $('#contactemail').val(), $('#contactphone').val(), $('#cancontact').val()]);}, errorCB, successCB);
}
function getContact()
{
	var db = getDb();
	db.transaction(queryGetContact, errorCB);
}
function queryGetContact(tx) {
    tx.executeSql('SELECT * FROM CONTACT2', [], successCBContact, errorCB);
}
function successCBContact(tx, results)
{
	var len = results.rows.length;
    if (len>0){
    	$('#contactfirstname').val(results.rows.item(0).contactfirstname);
    	$('#contactsurname').val(results.rows.item(0).contactsurname);
    	$('#contactemail').val(results.rows.item(0).contactemail);
    	$('#contactphone').val(results.rows.item(0).contactphone);
    	$('#cancontact').val(results.rows.item(0).cancontact);
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
var last_pos = null;
var watchID = null;
function watchGPS() {
	if (watchID == null) {
		var options = { frequency: 10000, enableHighAccuracy: true };
		watchID = navigator.geolocation.watchPosition(onGPSSuccess, onGPSError, options);
	}
}
function stopWatchGPS() {
	if (watchID != null) {
		navigator.geolocation.clearWatch(watchID);
		watchID = null;
	}
}
//onError Callback receives a PositionError object
//
function onGPSError(error) {
	console.log("Location Service Error: " + error.code + " message: " + error.message);
}

function onGPSSuccess(position) {
	//alert("Got GPS!");
	console.log("Location Service Success - accuracy: " + position.coords.accuracy);
	last_pos = position;
}
function useLastGPS() {
	//Only use the device location if we have it, and the reported accuracy is 
	//within 50 metres.
	var bLastPosGood = false;
	var position = last_pos;
	if (position) {
		if (position.coords.accuracy < 50)
		{
			bLastPosGood = true;
		}
	}
	if (bLastPosGood) {
		$('#locationgpslat').val(position.coords.latitude);
		$('#locationgpslng').val(position.coords.longitude);
		//Debugging information
		//$('#gpslatlng').html("Your position has been identified. <br>Accurate to: " + position.coords.accuracy + " metres. <br>Lat: " + position.coords.latitude + " <br>Lng: " + position.coords.longitude);
		//Normal output
		$('#gpslatlng').html("Your position has been identified.");
		$('#gpslatlng').show();
		$('#locnname').hide();
		$('#locnpcode').hide();
	} else {
		$('#gpslatlng').hide();
		if (position) {
			//include the (inaccurate) GPS data anyway, it's better than none.
			$('#locationgpslat').val(position.coords.latitude);
			$('#locationgpslng').val(position.coords.longitude);
		}
		$('#locnname').show();
		$('#locnpcode').show();
	}
	$.mobile.loading( 'hide' );
}
function getLocnGPS()
{
	showLoading("Getting location...");
	//navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError, {maximumAge: 60000, timeout: 10000, enableHighAccuracy: true});
	useLastGPS();
}

/**  END: GPS LOCATION FUNCTIONS */

/** FORM HANDLING FUNCTIONS */
function initForm()
{
	//try to get gps location settings
	getLocnGPS();
	getCurrentCounts();
	getContact();
	//populate timestamp with the current date/time
	var dte = new Date();
	$('#datetimereported').val(dte.toString());
	$('#deviceid').val(device.uuid);
}

function storeReport(data) {  
	showLoading("Saving report...");
	storeContact();

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
    	$.mobile.changePage('privacy.html', {changeHash: false});
    } else {
        submitToServer(data, null);
    }
    return false;
}

function submitToServer(data, localid)
{
	 $.support.cors = true;
     var jqxhr = $.post(SUBMIT_TO, data);
	
     if (localid == null)
     {
    	 //If local id is null, then we are handling a direct submission from the form, process then redirect.
    	 jqxhr.error(function() {storeLocal(data);});
    	 jqxhr.success(function() {incrementRecordedCount();incrementSubmittedCount();console.log("Data submitted to server");});
    	 jqxhr.complete(function() {$.mobile.changePage('privacy.html', {changeHash: false});});
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
    // Get image handle
    //
    $('#imgPreview').attr("src", "data:image/jpeg;base64," + imageData);
    $('#imgPreview').attr("style", "max-width:640px;width:100%;");
    $('#photo1').val("data:image/jpeg;base64," + imageData);

    // Unhide image elements
    //
    $('#imgPreview').show();
}

function capturePhoto() {
    // Take picture using device camera and retrieve image as base64-encoded string
	//pictureSource=navigator.camera.PictureSourceType;
    var destinationType=navigator.camera.DestinationType;
    navigator.camera.getPicture(onPhotoDataSuccess, onPhotoDataFail, { quality: 100,
      destinationType: destinationType.DATA_URL, targetWidth: 640, targetHeight: 640,
 });
}

function resetForm($form) {
	//Clear the image preview...
	$('#imgPreview').attr("src", "");
	
    $form.find('input:text, input:password, input:file, select, textarea')
    	.not('#contactfirstname, #contactsurname, #contactemail, #contactphone, #diseasecommonname, #treespecies')
    	.val('');
    $form.find('input:radio, input:checkbox')
    	.not('#cancontact')
        .removeAttr('checked').removeAttr('selected').checkboxradio("refresh");
    $form.find('#diseasecommonname, #treespecies')
    	.selectmenu()
    	.selectmenu('refresh', true);
    $form.find('.error')
    	.hide();
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
