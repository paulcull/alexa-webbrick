/**
 * For additional details, please refer to the Alexa Lighting API developer documentation
 * https://developer.amazon.com/public/binaries/content/assets/html/alexa-lighting-api.html
 */
var http = require('http'); //webbricks are only http
var conf = require('./conf/WBUser.json');
// var devicelist = require('./conf/dimonlydevices.json');
var devicelist = require('./conf/devices.json');
var uuid = require('uuid-v4');

var responseMap = {
  "DiscoverAppliancesRequest":"DiscoverAppliancesResponse",
  "TurnOnRequest":"TurnOnConfirmation",
  "TurnOffRequest":"TurnOffConfirmation",
  "setPercentageRequest":"SetPercentageConfirmation"
};

/**
 * Main entry point.
 * Incoming events from Alexa Lighting APIs are processed via this method.
 */
exports.handler = function(event, context) {
    "use strict";

    log('Nelmes Input', event);

    switch (event.header.namespace) {

        /**
         * The namespace of "Discovery" indicates a request is being made to the lambda for
         * discovering all appliances associated with the customer's appliance cloud account.
         * can use the accessToken that is made available as part of the payload to determine
         * the customer.
         */
        case 'Discovery':
        case 'Alexa.ConnectedHome.Discovery':
            handleDiscovery(event, context);
            break;

            /**
             * The namespace of "Control" indicates a request is being made to us to turn a
             * given device on, off or brighten. This message comes with the "appliance"
             * parameter which indicates the appliance that needs to be acted on.
             */
        case 'Control':
        case 'System':
        case 'Alexa.ConnectedHome.Control':
        case 'Alexa.ConnectedHome.System':
            handleControl(event, context);
            break;

            /**
             * We received an unexpected message
             */
        default:
            log('Err', 'No supported namespace: ' + event.header.namespace);
            context.fail('Something went wrong');
            break;
    }
};

/**
 * This method is invoked when we receive a "Discovery" message from Alexa Smart Home Skill.
 * We are expected to respond back with a list of appliances that we have discovered for a given
 * customer.
 */
function handleDiscovery(event, context) {
  "use strict";

    var msgRespID = uuid();
    /**
     * Crafting the response header
     */
    var headers = {
        messageID: msgRespID,
        namespace: 'Alexa.ConnectedHome.Discovery',
        name: responseMap[event.header.name],
        payloadVersion: '2'
    };

    /**
     * Response body will be an array of discovered devices.
     */
    var appliances = [];
    var maxAppCount = 1000;
    var dimmerCount = 0;
    var lightCount = 0;

    devicelist.devices.forEach(function(device) {
      var applianceDiscovered = '';
      // Only return first 10 - for testing
      if (dimmerCount < maxAppCount) {

        switch (device.deviceType) {

        // Handle the appliance mapping from device for dimmers
        case 'dimmer':

          dimmerCount = dimmerCount + 1;
           applianceDiscovered = {
              actions: [
                "setPercentage",
                "turnOn",
                "turnOff"
              ],
              additionalApplianceDetails: {
                deviceType: device.deviceType
                  //raw: device
              },
              applianceId: 'WB' + device.G,                     //'Sample-Device-ID',
              friendlyDescription: device.deviceName,
              friendlyName: device.zoneName,
              isReachable: true,
              manufacturerName: 'PAULCULL-WEBBRICK',              //'SmartThings',
              modelName: 'WB',
              version: 'VER01'
          };
          // this this device to the appliance list
          appliances.push(applianceDiscovered);
          break;

        case 'light':

          lightCount = lightCount + 1;
          applianceDiscovered = {
              actions: [
                "turnOn",
                "turnOff"
              ],
              additionalApplianceDetails: {
                deviceType: device.deviceType
                  //raw: device
              },
              applianceId: 'WB' + device.G,                     //'Sample-Device-ID',
              friendlyDescription: device.deviceName,
              friendlyName: device.zoneName,
              isReachable: true,
              manufacturerName: 'PAULCULL-WEBBRICK',              //'SmartThings',
              modelName: 'WB',
              version: 'VER01'
          };
          // this this device to the appliance list
          appliances.push(applianceDiscovered);
          break;

        // Handler for all non-supported device types
        default:
          log('Info', 'No supported device handler: ' + device.deviceType);
          break;
        }
      }
    });

    log('Appliance Count',appliances.length);
    log('Dimmers', dimmerCount);
    log('Lights', lightCount);

    /**
     * Craft the final response back to Alexa Smart Home Skill. This will include all the
     * discoverd appliances.
     */
    var payloads = {
        discoveredAppliances: appliances
    };
    var result = {
        header: headers,
        payload: payloads
    };

    log('Discovery', JSON.stringify(result));

    context.succeed(result);
}

/**
 * Control events are processed here.
 * This is called when Alexa requests an action (IE turn off appliance).
 */
function handleControl(event, context) {

  "use strict";

    /**
     * Fail the invocation if the header is unexpected. This example only demonstrates
     * turn on / turn off, hence we are filtering on anything that is not TurnOn/OffRequest or SetPercentageRequest
     * or HealthCheckRequest.
     */

    // implement Health Check
    if (event.header.namespace === 'Alexa.ConnectedHome.System' && event.header.name === 'HealthCheckRequest') {
      context.succeed(generateHealthResponse());
    } else if (  // implement Switch on or off
      (event.header.namespace === 'Alexa.ConnectedHome.Control' && event.header.name === 'TurnOnRequest')||
      (event.header.namespace === 'Alexa.ConnectedHome.Control' && event.header.name === 'TurnOffRequest')||
      (event.header.namespace === 'Alexa.ConnectedHome.Control' && event.header.name === 'SetPercentageRequest')
    ) {
        /**
         * Retrieve the appliance id and accessToken from the incoming message.
         */
        var applianceId = event.payload.appliance.applianceId;
        //var accessToken = event.payload.accessToken.trim();
        var device = devicelist.devices.filter(function (dev) {
          // console.log('applianceId',applianceId);
          // console.log('deviceCheck',dev);
          var testAppID = 'WB'+dev.G;
          if (testAppID === applianceId) {
            return true;
          } else {
            return false;
          }
        });
        log('applianceId', applianceId);
        log('device', device);


        //
        // create the callback handler for the WB callback
        //
        var callback = function(response) {
            var str = '';

            response.on('data', function(chunk) {
                str += chunk.toString('utf-8');
            });

            response.on('end', function() {

              /**
               * Create a unique message ID
               */
              var msgRespID = uuid();

              /**
               * Test the response from remote endpoint (not shown) and craft a response message
               * back to Alexa Smart Home Skill
               */
              // log('done with result');
              var headers = {
                  messageID: msgRespID,
                  namespace: event.header.namespace,
                  name: responseMap[event.header.name],
                  payloadVersion: '2'
              };
              var payloads = {
                  //success: true
              };
              var result = {
                  header: headers,
                  payload: payloads
              };
              log('Done with result', result);
              context.succeed(result);
            });

            response.on('error', function(e) {
                log('Error', e.message);
                /**
                 * Craft an error response back to Alexa Connected Home Skill
                 */
                context.fail(generateControlError(event.header.name, 'DEPENDENT_SERVICE_UNAVAILABLE', 'Unable to connect to server'));
            });

        };

        /**
         * Make an HTTP call to remote endpoint.
         */
         var basePath = '/wbproxy/';
         var commandMap = {
           "dimmer":"/hid.spi?COM=AA",
           "light":"/hid.spi?COM=DO"
         };
         var onMap = {
           "dimmer":"100",
           "light":"N"
         };
         var offMap = {
           "dimmer":"0",
           "light":"F"
         };
         var fullURL = '';

         if (event.header.name === 'TurnOnRequest') {
           fullURL = basePath + device[0].brickIp + commandMap[device[0].deviceType] + device[0].channel + ';' + onMap[device[0].deviceType] + ':';
         } else if (event.header.name === 'TurnOffRequest') {
           fullURL = basePath + device[0].brickIp + commandMap[device[0].deviceType] + device[0].channel + ';' + offMap[device[0].deviceType] + ':';
         } else if (event.header.name === 'SetPercentageRequest') {
           fullURL = basePath + device[0].brickIp + commandMap[device[0].deviceType] + device[0].channel + ';' + event.payload.percentageState.value + ':';
         }

         var options = {
           method:'PUT',
           path:fullURL,
           hostname:conf.EXTURL,
           port:conf.HOMEPORT,
           json:{on:false},
           timeout:1000
         };

        http.get(options, callback)
            .on('error', function(e) {
                log('Error', e.message);
                /**
                 * Craft an error response back to Alexa Connected Home Skill
                 */
                context.fail(generateControlError('SwitchOnOffRequest', 'DEPENDENT_SERVICE_UNAVAILABLE', 'Unable to connect to server'));
            }).end();

    } else {
          context.fail(generateControlError(event.header.name, 'UNSUPPORTED_OPERATION', 'Unrecognized operation'));
    }
}

/**
 * Utility functions.
 */
function log(title, msg) {
  "use strict";
    console.log('*************** ' + title + ' Start *************');
    console.log(msg);
    console.log('*************** ' + title + ' -End- *************');
}

function generateHealthResponse() {
  "use strict";

  var msgRespID = uuid();

  var headers = {
    messageID: msgRespID,
    namespace: 'Alexa.ConnectedHome.System',
    name: 'HealthCheckResponse',
    payloadVersion: 2
  };

  var payload = {
    'description' : 'The Webbrick system driver appears to be working, but I have not looked too hard',
    'isHealthy' : true
  };

  var result = {
      header: headers,
      payload: payload
  };

  return result;


}

function generateControlError(name, code, description) {
  "use strict";

    var msgRespID = uuid();

    var headers = {
        messageID: msgRespID,
        namespace: 'Control',
        name: name,
        payloadVersion: '1'
    };

    var payload = {
        exception: {
            code: code,
            description: description
        }
    };

    var result = {
        header: headers,
        payload: payload
    };

    return result;
}
