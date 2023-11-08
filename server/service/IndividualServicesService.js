'use strict';
const LogicalTerminationPointConfigurationInput = require('onf-core-model-ap/applicationPattern/onfModel/services/models/logicalTerminationPoint/ConfigurationInput');
const LogicalTerminationPointService = require('onf-core-model-ap/applicationPattern/onfModel/services/LogicalTerminationPointServices');
const ForwardingConfigurationService = require('onf-core-model-ap/applicationPattern/onfModel/services/ForwardingConstructConfigurationServices');
const ForwardingAutomationService = require('onf-core-model-ap/applicationPattern/onfModel/services/ForwardingConstructAutomationServices');
const ConfigurationStatus = require('onf-core-model-ap/applicationPattern/onfModel/services/models/ConfigurationStatus');
const httpServerInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/HttpServerInterface');
const tcpServerInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/TcpServerInterface');
const operationServerInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/OperationServerInterface');
const httpClientInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/HttpClientInterface');
const onfAttributeFormatter = require('onf-core-model-ap/applicationPattern/onfModel/utility/OnfAttributeFormatter');
const consequentAction = require('onf-core-model-ap/applicationPattern/rest/server/responseBody/ConsequentAction');
const responseValue = require('onf-core-model-ap/applicationPattern/rest/server/responseBody/ResponseValue');
const onfPaths = require('onf-core-model-ap/applicationPattern/onfModel/constants/OnfPaths');
const onfAttributes = require('onf-core-model-ap/applicationPattern/onfModel/constants/OnfAttributes');
const logicalTerminationPoint = require('onf-core-model-ap/applicationPattern/onfModel/models/LogicalTerminationPoint');
const tcpClientInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/TcpClientInterface');
const ForwardingDomain = require('onf-core-model-ap/applicationPattern/onfModel/models/ForwardingDomain');
const ForwardingConstruct = require('onf-core-model-ap/applicationPattern/onfModel/models/ForwardingConstruct');
const FcPort = require('onf-core-model-ap/applicationPattern/onfModel/models/FcPort');
const HttpClientInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/HttpClientInterface');
const ResponseProfile = require('onf-core-model-ap/applicationPattern/onfModel/models/profile/ResponseProfile');
const ProfileCollection = require('onf-core-model-ap/applicationPattern/onfModel/models/ProfileCollection');
const LogicalTerminationPoint = require('onf-core-model-ap/applicationPattern/onfModel/models/LogicalTerminationPoint');
const OperationClientInterface = require('onf-core-model-ap/applicationPattern/onfModel/models/layerProtocols/OperationClientInterface');
const genericRepresentation = require('onf-core-model-ap-bs/basicServices/GenericRepresentation');
const createHttpError = require('http-errors');
const TcpObject = require('onf-core-model-ap/applicationPattern/onfModel/services/models/TcpObject');
const RestClient = require('./individualServices/rest/client/dispacher');
const cacheResponse = require('./individualServices/cacheResponseBuilder');
const cacheUpdate = require('./individualServices/cacheUpdateBuilder');
const fieldsManager = require('./individualServices/fieldsManagement');
const { getIndexAliasAsync, createResultArray, elasticsearchService } = require('onf-core-model-ap/applicationPattern/services/ElasticsearchService');


/**
 * Initiates process of embedding a new release
 *
 * body V1_bequeathyourdataanddie_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.bequeathYourDataAndDie = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(async function (resolve, reject) {
    try {
      let newApplicationName = body["new-application-name"];
      let newReleaseNumber = body["new-application-release"];
      let newAddress = body["new-application-address"];
      let newPort = body["new-application-port"];
      let newProtocol = body['new-application-protocol'];

      let newReleaseHttpClientLtpUuid = await LogicalTerminationPointServiceOfUtility.resolveHttpTcpAndOperationClientUuidOfNewRelease();
      let newReleaseHttpUuid = newReleaseHttpClientLtpUuid.httpClientUuid;
      let newReleaseTcpUuid = newReleaseHttpClientLtpUuid.tcpClientUuid;

      /**
       * Current values in NewRelease client.
       */
      let currentApplicationName = await httpClientInterface.getApplicationNameAsync(newReleaseHttpUuid);
      let currentReleaseNumber = await httpClientInterface.getReleaseNumberAsync(newReleaseHttpUuid);
      let currentRemoteAddress = await tcpClientInterface.getRemoteAddressAsync(newReleaseTcpUuid);
      let currentRemoteProtocol = await tcpClientInterface.getRemoteProtocolAsync(newReleaseTcpUuid);
      let currentRemotePort = await tcpClientInterface.getRemotePortAsync(newReleaseTcpUuid);

      /**
       * Update only data that needs to be updated, comparing incoming values with values set in
       * NewRelease client.
       */
      let isUpdated = {};
      let isDataTransferRequired = true;
      if (newApplicationName !== currentApplicationName) {
        isUpdated.applicationName = await httpClientInterface.setApplicationNameAsync(newReleaseHttpUuid, newApplicationName)
      }
      if (newReleaseNumber !== currentReleaseNumber) {
        isUpdated.releaseNumber = await httpClientInterface.setReleaseNumberAsync(newReleaseHttpUuid, newReleaseNumber);
      }
      if (isAddressChanged(currentRemoteAddress, newAddress)) {
        isUpdated.address = await tcpClientInterface.setRemoteAddressAsync(newReleaseTcpUuid, newAddress);
      }
      if (newPort !== currentRemotePort) {
        isUpdated.port = await tcpClientInterface.setRemotePortAsync(newReleaseTcpUuid, newPort);
      }
      if (newProtocol !== currentRemoteProtocol) {
        isUpdated.protocol = await tcpClientInterface.setRemoteProtocolAsync(newReleaseTcpUuid, newProtocol);
      }


      /**
       * Updating the Configuration Status based on the application information updated
       */
      let tcpClientConfigurationStatus = new ConfigurationStatus(
        newReleaseTcpUuid,
        '',
        (isUpdated.address || isUpdated.port || isUpdated.protocol)
      );
      let httpClientConfigurationStatus = new ConfigurationStatus(
        newReleaseHttpUuid,
        '',
        (isUpdated.applicationName || isUpdated.releaseNumber)
      );

      let logicalTerminationPointConfigurationStatus = new LogicalTerminationPointConfigurationStatus(
        false,
        httpClientConfigurationStatus,
        [tcpClientConfigurationStatus]
      );

      /****************************************************************************************
       * Prepare attributes to automate forwarding-construct
       ****************************************************************************************/
      let forwardingAutomationInputList = await prepareALTForwardingAutomation.getALTForwardingAutomationInputAsync(
        logicalTerminationPointConfigurationStatus,
        undefined
      );
      ForwardingAutomationService.automateForwardingConstructAsync(
        operationServerName,
        forwardingAutomationInputList,
        user,
        xCorrelator,
        traceIndicator,
        customerJourney
      );

      softwareUpgrade.upgradeSoftwareVersion(isDataTransferRequired, newReleaseHttpUuid, user, xCorrelator, traceIndicator, customerJourney, forwardingAutomationInputList.length)
        .catch(err => console.log(`upgradeSoftwareVersion failed with error: ${err}`));
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}


/**
 * Provides ActualEquipment from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_12
 **/
exports.getCachedActualEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides AirInterfaceCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_31
 **/
exports.getCachedAirInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides AirInterfaceConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_32
 **/
exports.getCachedAirInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides AirInterfaceHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_34
 **/
exports.getCachedAirInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });

}


/**
 * Provides AirInterfaceStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_33
 **/
exports.getCachedAirInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });

}


/**
 * Provides AlarmCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_4
 **/
exports.getCachedAlarmCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides AlarmConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_5
 **/
exports.getCachedAlarmConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides AlarmEventRecords from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_7
 **/
exports.getCachedAlarmEventRecords = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides CoChannelProfileCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_19
 **/
exports.getCachedCoChannelProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides CoChannelProfileConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_20
 **/
exports.getCachedCoChannelProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });}


/**
 * Provides Connector from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_9
 **/
exports.getCachedConnector = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides ContainedHolder from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_10
 **/
exports.getCachedContainedHolder = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides ControlConstruct from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_3
 **/
exports.getCachedControlConstruct = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields');
    url = parts[0];
    //const fields = parts[1];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
    let mountname = decodeMountName(url, true);
    let correctMountname = "";
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides CurrentAlarms from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_6
 **/
exports.getCachedCurrentAlarms = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides Equipment from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_8
 **/
exports.getCachedEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides EthernetContainerCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_35
 **/
exports.getCachedEthernetContainerCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides EthernetContainerConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_36
 **/
exports.getCachedEthernetContainerConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides EthernetContainerHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_38
 **/
exports.getCachedEthernetContainerHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides EthernetContainerStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_37
 **/
exports.getCachedEthernetContainerStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides ExpectedEquipment from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_11
 **/
exports.getCachedExpectedEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides FirmwareCollection from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_13
 **/
exports.getCachedFirmwareCollection = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides FirmwareComponentCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_15
 **/
exports.getCachedFirmwareComponentCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides FirmwareComponentList from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_14
 **/
exports.getCachedFirmwareComponentList = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides FirmwareComponentStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_16
 **/
exports.getCachedFirmwareComponentStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides HybridMwStructureCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_39
 **/
exports.getCachedHybridMwStructureCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });

}


/**
 * Provides HybridMwStructureConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_40
 **/
exports.getCachedHybridMwStructureConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });

}


/**
 * Provides HybridMwStructureHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_42
 **/
exports.getCachedHybridMwStructureHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides HybridMwStructureStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_41
 **/
exports.getCachedHybridMwStructureStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides LogicalTerminationPoint from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_29
 **/
exports.getLiveLogicalTerminationPoint = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides LtpAugment from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_30
 **/
exports.getLiveLtpAugment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides MacInterfaceCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_43
 **/
exports.getCachedMacInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides MacInterfaceConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_44
 **/
exports.getCachedMacInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides MacInterfaceHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_46
 **/
exports.getCachedMacInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides MacInterfaceStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_45
 **/
exports.getCachedMacInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides PolicingProfileCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_21
 **/
exports.getCachedPolicingProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides PolicingProfileConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_22
 **/
exports.getCachedPolicingProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides Profile from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_18
 **/
exports.getCachedProfile = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides ProfileCollection from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_17
 **/
exports.getCachedProfileCollection = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}

/**
 * Provides PureEthernetStructureCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_47
 **/
exports.getCachedPureEthernetStructureCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides PureEthernetStructureConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_48
 **/
exports.getCachedPureEthernetStructureConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides PureEthernetStructureHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_50
 **/
exports.getCachedPureEthernetStructureHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides PureEthernetStructureStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_49
 **/
exports.getCachedPureEthernetStructureStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides QosProfileCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_23
 **/
exports.getCachedQosProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides QosProfileConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_24
 **/
exports.getCachedQosProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides SchedulerProfileCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_25
 **/
exports.getCachedSchedulerProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides SchedulerProfileConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_26
 **/
exports.getCachedSchedulerProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides VlanInterfaceCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_51
 **/
exports.getCachedVlanInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides VlanInterfaceConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_52
 **/
exports.getCachedVlanInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides VlanInterfaceHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_54
 **/
exports.getCachedVlanInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides VlanInterfaceStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_53
 **/
exports.getCachedVlanInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WireInterfaceCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_55
 **/
exports.getCachedWireInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WireInterfaceConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_56
 **/
exports.getCachedWireInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WireInterfaceHistoricalPerformances from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_58
 **/
exports.getCachedWireInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WireInterfaceStatus from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_57
 **/
exports.getCachedWireInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WredProfileCapability from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_27
 **/
exports.getCachedWredProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides WredProfileConfiguration from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_28
 **/
exports.getCachedWredProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides LogicalTerminationPoint from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_29
 **/
exports.getCachedLogicalTerminationPoint = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides LtpAugment from cache
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_30
 **/
exports.getCachedLtpAugment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    const myFields = user;
    url = decodeURIComponent(url);
    const parts = url.split('?fields=');
    url = parts[0];
    //const fields = parts[1];
    let correctMountname = null;
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url);
//    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctMountname = mountname;
    }
    let returnObject = {};
    const finalUrl = appNameAndUuidFromForwarding[1].url;
    const correctUrl = modifyUrlConcatenateMountNamePlusUuid(finalUrl, correctMountname);
    let result = await ReadRecords(correctMountname);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(correctUrl, result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        returnObject[objectKey] = finalJson;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides ActualEquipment from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_12
 **/
exports.getLiveActualEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AirInterfaceCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_31
 **/
exports.getLiveAirInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AirInterfaceConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_32
 **/
exports.getLiveAirInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AirInterfaceCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_59
 **/
exports.getLiveAirInterfaceCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides AirInterfaceHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_34
 **/
exports.getLiveAirInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AirInterfaceStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_33
 **/
exports.getLiveAirInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AlarmCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_4
 **/
exports.getLiveAlarmCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AlarmConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_5
 **/
exports.getLiveAlarmConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides AlarmEventRecords from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_7
 **/
exports.getLiveAlarmEventRecords = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides CoChannelProfileCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_19
 **/
exports.getLiveCoChannelProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides CoChannelProfileConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_20
 **/
exports.getLiveCoChannelProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides Connector from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_9
 **/
exports.getLiveConnector = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides ContainedHolder from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_10
 **/
exports.getLiveContainedHolder = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides ControlConstruct from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountname String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_3
 **/
exports.getLiveControlConstruct = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountname, fields) {
  return new Promise(async function (resolve, reject) {
    url = decodeURIComponent(url);
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const urlParts = url.split("?fields=");
    const myFields = urlParts[1];

    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    const finalUrl1 = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const finalUrl = formatUrlForOdl(appNameAndUuidFromForwarding[0].url);
    const Authorization = appNameAndUuidFromForwarding[0].key;
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const result = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (result == false) {
        resolve(notFoundError());
      } else if (result.status != 200) {
        resolve(Error(result.status, result.statusText));
      } else {
        let jsonObj = result.data;
        modificaUUID(jsonObj, correctCc);
        if (myFields === undefined) {
          let elapsedTime = await recordRequest(jsonObj, correctCc);
          let res = cacheResponse.cacheResponseBuilder(url, jsonObj);
          resolve(res);
        } else {
          let filters = true;
          // Update record on ES
          let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
          let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
          // read from ES
          let result1 = await ReadRecords(correctCc);
          // Update json object
          let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result1, jsonObj, filters);
          // Write updated Json to ES
          let elapsedTime = await recordRequest(result1, correctCc);
          resolve(result.data);
        }

      }
    }


  });
}


/**
 * Provides CurrentAlarms from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_6
 **/
exports.getLiveCurrentAlarms = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides Equipment from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_8
 **/
exports.getLiveEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides EthernetContainerCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_35
 **/
exports.getLiveEthernetContainerCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides EthernetContainerConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_36
 **/
exports.getLiveEthernetContainerConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides EthernetContainerCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_60
 **/
exports.getLiveEthernetContainerCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides EthernetContainerHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_38
 **/
exports.getLiveEthernetContainerHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides EthernetContainerStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_37
 **/
exports.getLiveEthernetContainerStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides ExpectedEquipment from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_11
 **/
exports.getLiveExpectedEquipment = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides FirmwareCollection from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_13
 **/
exports.getLiveFirmwareCollection = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides FirmwareComponentCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_15
 **/
exports.getLiveFirmwareComponentCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides FirmwareComponentList from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_14
 **/
exports.getLiveFirmwareComponentList = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides FirmwareComponentStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_16
 **/
exports.getLiveFirmwareComponentStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides HybridMwStructureCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_39
 **/
exports.getLiveHybridMwStructureCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides HybridMwStructureConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_40
 **/
exports.getLiveHybridMwStructureConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides HybridMwStructureCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_61
 **/
exports.getLiveHybridMwStructureCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides HybridMwStructureHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_42
 **/
exports.getLiveHybridMwStructureHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides HybridMwStructureStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_41
 **/
exports.getLiveHybridMwStructureStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides MacInterfaceCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_43
 **/
exports.getLiveMacInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides MacInterfaceConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_44
 **/
exports.getLiveMacInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides MacInterfaceCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_62
 **/
exports.getLiveMacInterfaceCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides MacInterfaceHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_46
 **/
exports.getLiveMacInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides MacInterfaceStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_45
 **/
exports.getLiveMacInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PolicingProfileCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_21
 **/
exports.getLivePolicingProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PolicingProfileConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_22
 **/
exports.getLivePolicingProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides Profile from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_18
 **/
exports.getLiveProfile = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides ProfileCollection from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_17
 **/
exports.getLiveProfileCollection = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PureEthernetStructureCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_47
 **/
exports.getLivePureEthernetStructureCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PureEthernetStructureConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_48
 **/
exports.getLivePureEthernetStructureConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PureEthernetStructureCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_63
 **/
exports.getLivePureEthernetStructureCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides PureEthernetStructureHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_50
 **/
exports.getLivePureEthernetStructureHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides PureEthernetStructureStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_49
 **/
exports.getLivePureEthernetStructureStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides QosProfileCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_23
 **/
exports.getLiveQosProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides QosProfileConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_24
 **/
exports.getLiveQosProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides SchedulerProfileCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_25
 **/
exports.getLiveSchedulerProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });}


/**
 * Provides SchedulerProfileConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_26
 **/
exports.getLiveSchedulerProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides VlanInterfaceCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_51
 **/
exports.getLiveVlanInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides VlanInterfaceConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_52
 **/
exports.getLiveVlanInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides VlanInterfaceCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_64
 **/
exports.getLiveVlanInterfaceCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
      }
    }
  });
}


/**
 * Provides VlanInterfaceHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_54
 **/
exports.getLiveVlanInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides VlanInterfaceStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_53
 **/
exports.getLiveVlanInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides WireInterfaceCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_55
 **/
exports.getLiveWireInterfaceCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "wire-interface-2-0:wire-interface-capability": {}
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Provides WireInterfaceConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_56
 **/
exports.getLiveWireInterfaceConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "wire-interface-2-0:wire-interface-configuration": {}
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Provides WireInterfaceCurrentPerformance from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_65
 **/
exports.getLiveWireInterfaceCurrentPerformance = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "wire-interface-2-0:wire-interface-current-performance": {}
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Provides WireInterfaceHistoricalPerformances from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_58
 **/
exports.getLiveWireInterfaceHistoricalPerformances = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "wire-interface-2-0:wire-interface-historical-performances": {}
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Provides WireInterfaceStatus from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * localId String Instance identifier that is unique within its list
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_57
 **/
exports.getLiveWireInterfaceStatus = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, localId, fields) {
  return new Promise(function (resolve, reject) {
    var examples = {};
    examples['application/json'] = {
      "wire-interface-2-0:wire-interface-status": {}
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
}


/**
 * Provides WredProfileCapability from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_27
 **/
exports.getLiveWredProfileCapability = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}


/**
 * Provides WredProfileConfiguration from live network
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * mountName String The mount-name of the device that is addressed by the request
 * uuid String Instance identifier that is unique within the device
 * fields String Query parameter to filter ressources according to RFC8040 fields filter spec (optional)
 * returns inline_response_200_28
 **/
exports.getLiveWredProfileConfiguration = function (url, user, originator, xCorrelator, traceIndicator, customerJourney, mountName, uuid, fields) {
  return new Promise(async function (resolve, reject) {
    let jsonObj = "";
    url = decodeURIComponent(url);
    const urlParts = url.split("?fields=");
    url = urlParts[0];
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(url)
    const myFields = urlParts[1];
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    const Authorization = appNameAndUuidFromForwarding[0].key;
    let correctCc = null;
    //    let mountname = decodeURIComponent(url).match(/control-construct=([^/]+)/)[1];
    let mountname = decodeMountName(url, false);
    if (typeof mountname === 'object') {
      resolve(Error(mountname[0].code, mountname[0].message));
      return;
    } else {
      correctCc = mountname;
    }
    if (appNameAndUuidFromForwarding[0].applicationName.indexOf("OpenDayLight") != -1) {
      const res = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization)
      if (res == false) {
        resolve(notFoundError());
      } else if (res.status != 200) {
        resolve(Error(res.status, res.statusText));
      } else {
        let jsonObj = res.data;
        modificaUUID(jsonObj, correctCc);
        resolve(jsonObj);
        let filters = false;
        if (myFields !== undefined) {
          filters = true;
        }
        // Update record on ES
        let Url = decodeURIComponent(appNameAndUuidFromForwarding[1].url);
        let correctUrl = modifyUrlConcatenateMountNamePlusUuid(Url, correctCc);
        // read from ES
        let result = await ReadRecords(correctCc);
        // Update json object
        let finalJson = cacheUpdate.cacheUpdateBuilder(correctUrl, result, jsonObj, filters);
        // Write updated Json to ES
        let elapsedTime = await recordRequest(result, correctCc);
      }
    }
  });
}

/**
 * Offers subscribing for notifications about device attributes being changed in the cache
 *
 * body V1_notifyattributevaluechanges_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.notifyAttributeValueChanges = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Offers subscribing for notifications about device objects being created in the cache
 *
 * body V1_notifyobjectcreations_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.notifyObjectCreations = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Offers subscribing for notifications about device objects being deleted from the cache
 *
 * body V1_notifyobjectdeletions_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.notifyObjectDeletions = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Provides list of actual equipment UUIDs inside a device
 *
 * body V1_providelistofactualdeviceequipment_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * returns inline_response_200_2
 **/
exports.provideListOfActualDeviceEquipment = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(async function (resolve, reject) {
    let mountName = body['mountName'];
    const appNameAndUuidFromForwarding = await RequestForListOfActualDeviceEquipmentCausesReadingFromCache(mountName)
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    let returnObject = {};
    let parts = finalUrl.split("?fields=");
    let myFields = parts[1];
    let result = await ReadRecords(mountName);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(parts[0], result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        const transformedData = {
          "top-level-equipment": finalJson[0]["top-level-equipment"],
          "actual-equipment-list": finalJson[0]["equipment"].map((item) => {
            return {
              uuid: item.uuid,
              "equipment-type-name": item["actual-equipment"]?.["manufactured-thing"]?.["equipment-type"]?.["type-name"],
            };
          }),
        };
        returnObject = transformedData;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Provides list of devices that are connected to the controller
 *
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * returns inline_response_200
 **/
exports.provideListOfConnectedDevices = function (url, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(async function (resolve, reject) {
    let mountname = "DeviceList"
    let returnObject = {};
    let result = await ReadRecords(mountname);
    if (result != undefined) {
      const outputJson = {
        "mountName-list": result.deviceList.map(item => item["node-id"])
      };
      resolve(outputJson);
    } else {
      resolve(notFoundError());
    }
  });
}


/**
 * Provides list of LTP UUIDs at a device
 *
 * body V1_providelistofdeviceinterfaces_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * returns inline_response_200_1
 **/
exports.provideListOfDeviceInterfaces = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(async function (resolve, reject) {
    
    let mountName = body['mountName'];
    const appNameAndUuidFromForwarding = await RequestForListOfDeviceInterfacesCausesReadingFromCache(mountName)
    const finalUrl = formatUrlForOdl(decodeURIComponent(appNameAndUuidFromForwarding[0].url));
    let returnObject = {};
    let toChangeObject = {};
    let parts = finalUrl.split("?fields=");
    let myFields = parts[1];
    let result = await ReadRecords(mountName);
    if (result != undefined) {
      let finalJson = cacheResponse.cacheResponseBuilder(parts[0], result);
      if (finalJson != undefined) {
        let objectKey = Object.keys(finalJson)[0];
        finalJson = finalJson[objectKey];
        if (myFields != undefined) {
          var objList = [];
          var rootObj = { value: "root", children: [] }
          var ret = fieldsManager.decodeFieldsSubstringExt(myFields, 0, rootObj)
          objList.push(rootObj)
          fieldsManager.getFilteredJsonExt(finalJson, objList[0].children);
        }
        toChangeObject["logical-termination-point-list"] = finalJson[0][Object.keys(finalJson[0])];
        const transformedData = {
          "logical-termination-point-list": toChangeObject["logical-termination-point-list"].map((item) => {
            return {
              "uuid": item.uuid,
              "localId": item["layer-protocol"][0]["local-id"],
              "layer-protocol-name": item["layer-protocol"][0]["layer-protocol-name"],
            };
          }),
        };
        returnObject = transformedData;
      } else {
        returnObject = notFoundError();
      }
    } else {
      returnObject = notFoundError();
    }
    resolve(returnObject);
  });
}


/**
 * Receives notifications about attribute value changes at the Controller
 *
 * body V1_regardcontrollerattributevaluechange_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.regardControllerAttributeValueChange = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Receives notifications about alarms at devices
 *
 * body V1_regarddevicealarm_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.regardDeviceAlarm = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Receives notifications about changes of values of attributes inside the devices
 *
 * body V1_regarddeviceattributevaluechange_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.regardDeviceAttributeValueChange = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Receives notifications about objects that have been created inside the devices
 *
 * body V1_regarddeviceobjectcreation_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.regardDeviceObjectCreation = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}


/**
 * Receives notifications about objects that have been deleted inside the devices
 *
 * body V1_regarddeviceobjectdeletion_body 
 * user String User identifier from the system starting the service call
 * originator String 'Identification for the system consuming the API, as defined in  [/core-model-1-4:control-construct/logical-termination-point={uuid}/layer-protocol=0/http-client-interface-1-0:http-client-interface-pac/http-client-interface-configuration/application-name]' 
 * xCorrelator String UUID for the service execution flow that allows to correlate requests and responses
 * traceIndicator String Sequence of request numbers along the flow
 * customerJourney String Holds information supporting customer’s journey to which the execution applies
 * no response value expected for this operation
 **/
exports.regardDeviceObjectDeletion = function (url, body, user, originator, xCorrelator, traceIndicator, customerJourney) {
  return new Promise(function (resolve, reject) {
    resolve();
  });
}

exports.getLiveDeviceList = function(url) {
  return new Promise(async function(resolve, reject) {
    const appNameAndUuidFromForwarding = await resolveApplicationNameAndHttpClientLtpUuidFromForwardingNameForDeviceList();
    const finalUrl = appNameAndUuidFromForwarding[0].url;
    const Authorization = appNameAndUuidFromForwarding[0].key;
    const result = await RestClient.dispatchEvent(finalUrl, 'GET', '', Authorization);
    if (result.status == 200) {
      let deviceList = result["data"]["network-topology:topology"][0].node;
      resolve(deviceList);
    } else {
      reject("Error in retrieving device list from ODL. (" + result.status + " - " + result.statusText + ")");
    }
  });
}

exports.writeDeviceListToElasticsearch = function(deviceList) {
  return new Promise(async function(resolve, reject) {
    let deviceListToWrite = '{"deviceList":' + deviceList + '}';
    let result = await recordRequest(deviceListToWrite, "DeviceList");
    resolve(true);
  })
}

exports.readDeviceListFromElasticsearch = function() {
  return new Promise(async function(resolve, reject) {
    let result = await ReadRecords("DeviceList");
    if (result == undefined) {
      reject("Device list in Elasticsearch not found");
    } else {
      let esDeviceList = result["deviceList"];
      resolve(esDeviceList);
    }    
  })
}

exports.deleteRecordFromElasticsearch = function(index, type, id) {
  return new Promise(async function(resolve, reject) {
    let exists = false;
    let client = await elasticsearchService.getClient(false);
    if (id) {
      exists = await client.exists({ index: index, type: type, id: id });
    }
    let ret
    if (exists.body) {
      await client.delete({ index: index, type: type, id: id });
      ret = { _id: id, result: 'Element '+ id + ' deleted.'};
    } else {
      ret = { _id: id, result: 'Element '+ id + ' not deleted. (Not found in elasticsearch).'};
    }    
    resolve(ret);
  })
}

async function resolveApplicationNameAndHttpClientLtpUuidFromForwardingNameForDeviceList() {
  const forwardingName = "PromptForEmbeddingCausesCyclicLoadingOfDeviceListFromController";
  const forwardingConstruct = await ForwardingDomain.getForwardingConstructForTheForwardingNameAsync(forwardingName);
  if (forwardingConstruct === undefined) {
      return null;
  }

  let fcPortOutputDirectionLogicalTerminationPointList = [];
  const fcPortList = forwardingConstruct[onfAttributes.FORWARDING_CONSTRUCT.FC_PORT];
  for (const fcPort of fcPortList) {
      const portDirection = fcPort[onfAttributes.FC_PORT.PORT_DIRECTION];
      if (FcPort.portDirectionEnum.OUTPUT === portDirection) {
          fcPortOutputDirectionLogicalTerminationPointList.push(fcPort[onfAttributes.FC_PORT.LOGICAL_TERMINATION_POINT]);
      }
  }
  
  let applicationNameList = [];
  //let urlForOdl = "/rests/data/network-topology:network-topology/topology=topology-netconf";
  //let urlForOdl = "/rests/data/network-topology:network-topology?fields=topology/node(node-id;netconf-node-topology:connection-status)"
  let urlForOdl = "/rests/data/network-topology:network-topology/topology=topology-netconf?fields=node(node-id;netconf-node-topology:connection-status)"
  for (const opLtpUuid of fcPortOutputDirectionLogicalTerminationPointList) {
      const httpLtpUuidList = await LogicalTerminationPoint.getServerLtpListAsync(opLtpUuid);
      const httpClientLtpUuid = httpLtpUuidList[0];
      let applicationName = 'api';
      const path = await OperationClientInterface.getOperationNameAsync(opLtpUuid);
      const key = await OperationClientInterface.getOperationKeyAsync(opLtpUuid)
      let url = "";
      let tcpConn = "";
      if (opLtpUuid.includes("odl")) { 
          applicationName = "OpenDayLight";
          tcpConn = await OperationClientInterface.getTcpClientConnectionInfoAsync(opLtpUuid);
          url = tcpConn + urlForOdl;
      }
      const applicationNameData = applicationName === undefined ? {
          applicationName: null,
          httpClientLtpUuid,
          url: null, key: null
      } : {
          applicationName,
          httpClientLtpUuid,
          url, key
      };
      applicationNameList.push(applicationNameData);      
  }
  return applicationNameList;
}



/* List of functions needed for individual services*/


/**
 * Receives notifications about objects that have been deleted inside the devices
 *
 * calculates the correct ip, port and protocol to address ODL and ES 
 * Returns a list of 2 arrays.
 * the first contains the ODL parameters and the URL to call
 * the second contains the same for ES
 **/
async function resolveApplicationNameAndHttpClientLtpUuidFromForwardingName(originalUrl) {
  const forwardingName = "RequestForLiveControlConstructCausesReadingFromDeviceAndWritingIntoCache";
  const forwardingConstruct = await ForwardingDomain.getForwardingConstructForTheForwardingNameAsync(forwardingName);
  if (forwardingConstruct === undefined) {
    return null;
  }

  let fcPortOutputDirectionLogicalTerminationPointList = [];
  const fcPortList = forwardingConstruct[onfAttributes.FORWARDING_CONSTRUCT.FC_PORT];
  for (const fcPort of fcPortList) {
    const portDirection = fcPort[onfAttributes.FC_PORT.PORT_DIRECTION];
    if (FcPort.portDirectionEnum.OUTPUT === portDirection) {
      fcPortOutputDirectionLogicalTerminationPointList.push(fcPort[onfAttributes.FC_PORT.LOGICAL_TERMINATION_POINT]);
    }
  }

  /*  if (fcPortOutputDirectionLogicalTerminationPointList.length !== 1) {
     return null;
   } */
  let applicationNameList = [];
  let urlForOdl = "/rests/data/network-topology:network-topology/topology=topology-netconf";
  for (const opLtpUuid of fcPortOutputDirectionLogicalTerminationPointList) {
    //const opLtpUuid = fcPortOutputDirectionLogicalTerminationPointList[0];
    const httpLtpUuidList = await LogicalTerminationPoint.getServerLtpListAsync(opLtpUuid);
    const httpClientLtpUuid = httpLtpUuidList[0];
    let applicationName = 'api';
    /*const applicationName = await httpClientInterface.getApplicationNameAsync(httpClientLtpUuid);*/
    const path = await OperationClientInterface.getOperationNameAsync(opLtpUuid);
    const key = await OperationClientInterface.getOperationKeyAsync(opLtpUuid)
    let url = "";
    let tcpConn = "";
    if (opLtpUuid.includes("odl")) {
      applicationName = "OpenDayLight";
      tcpConn = await OperationClientInterface.getTcpClientConnectionInfoAsync(opLtpUuid);
      url = retrieveCorrectUrl(originalUrl, tcpConn, applicationName);
    } else if (opLtpUuid.includes("es")) {
      tcpConn = await getTcpClientConnectionInfoAsync(opLtpUuid);
      applicationName = "ElasticSearch";
      url = retrieveCorrectUrl(originalUrl, tcpConn, applicationName);
    }
    const applicationNameData = applicationName === undefined ? {
      applicationName: null,
      httpClientLtpUuid,
      url: null, key: null
    } : {
      applicationName,
      httpClientLtpUuid,
      url, key
    };
    applicationNameList.push(applicationNameData);
  }
  return applicationNameList;
}

async function getTcpClientConnectionInfoAsync(operationClientUuid) {
  let httpClientUuidList = await logicalTerminationPoint.getServerLtpListAsync(operationClientUuid);
  let httpClientUuid = httpClientUuidList[0];
  let tcpClientUuidList = await logicalTerminationPoint.getServerLtpListAsync(httpClientUuid);
  let tcpClientUuid = tcpClientUuidList[0];
  let tcpServerUuidList = await logicalTerminationPoint.getServerLtpListAsync(tcpClientUuid);
  let tcpServerUuid = tcpServerUuidList[0];
  let tcpClientRemoteAddress = await tcpClientInterface.getRemoteAddressAsync(tcpServerUuid);
  let remoteAddress = await getConfiguredRemoteAddress(tcpClientRemoteAddress);
  let remotePort = await tcpClientInterface.getRemotePortAsync(tcpServerUuid);
  let remoteProtocol = await tcpClientInterface.getRemoteProtocolAsync(tcpServerUuid);
  return remoteProtocol.toLowerCase() + "://" + remoteAddress + ":" + remotePort;
}

function getConfiguredRemoteAddress(remoteAddress) {
  let domainName = onfAttributes.TCP_CLIENT.DOMAIN_NAME;
  if (domainName in remoteAddress) {
    remoteAddress = remoteAddress["domain-name"];
  } else {
    remoteAddress = remoteAddress[
      onfAttributes.TCP_CLIENT.IP_ADDRESS][
      onfAttributes.TCP_CLIENT.IPV_4_ADDRESS
    ];
  }
  return remoteAddress;
}

function retrieveCorrectUrl(originalUrl, path, applicationName) {
  const urlParts = originalUrl.split("?fields=");
  const myFields = urlParts[1];
  let ControlConstruct = urlParts[0].match(/control-construct=([^/]+)/)[1];
  let placeHolder = "";
  if (applicationName === "OpenDayLight") {
    placeHolder = "/rests/data/network-topology:network-topology/topology=topology-netconf/node=tochange/yang-ext:mount/core-model-1-4:control-construct"
  } else if (applicationName === "ElasticSearch") {
    placeHolder = "/";
  }
  var sequenzaDaCercare = "control-construct=" + ControlConstruct;
  var indiceSequenza = originalUrl.indexOf(sequenzaDaCercare);

  if (indiceSequenza !== -1) {
    var parte1 = urlParts[0].substring(0, indiceSequenza);
    if (applicationName === "OpenDayLight") {
      var parte2 = urlParts[0].substring(indiceSequenza + sequenzaDaCercare.length);
    } else if (applicationName === "ElasticSearch") {
      var parte2 = urlParts[0].substring(indiceSequenza);
    }
  }

  let correctPlaceHolder = placeHolder.replace("tochange", ControlConstruct);
  let final = path + correctPlaceHolder + parte2;
  if (final.indexOf("+") != -1) {
    var correctUrl = final.replace(/=.*?\+/g, "=");
  } else {
    correctUrl = final;
  }
  if (myFields != undefined) {
    final = final + "?fields=" + myFields;
  }
  return final;
}

async function RequestForListOfDeviceInterfacesCausesReadingFromCache(mountName){
  
    const forwardingName = "RequestForListOfDeviceInterfacesCausesReadingFromCache";
    const forwardingConstruct = await ForwardingDomain.getForwardingConstructForTheForwardingNameAsync(forwardingName);
   // const forwardingConstruct1 = await ForwardingDomain.

    let fcPortOutputDirectionLogicalTerminationPointList = [];
    const fcPortList = forwardingConstruct[onfAttributes.FORWARDING_CONSTRUCT.FC_PORT];
    for (const fcPort of fcPortList) {
        const portDirection = fcPort[onfAttributes.FC_PORT.PORT_DIRECTION];
        if (FcPort.portDirectionEnum.OUTPUT === portDirection) {
            fcPortOutputDirectionLogicalTerminationPointList.push(fcPort[onfAttributes.FC_PORT.LOGICAL_TERMINATION_POINT]);
        }
    }

    let applicationNameList = [];
  //let urlForOdl = "/rests/data/network-topology:network-topology/topology=topology-netconf";
  //let urlForOdl = "/rests/data/network-topology:network-topology?fields=topology/node(node-id;netconf-node-topology:connection-status)"
  let urlForEs = "/control-construct={mountName}?fields=logical-termination-point(uuid;layer-protocol(local-id;layer-protocol-name))"
  let correctUrl = urlForEs.replace("{mountName}", mountName);
  for (const opLtpUuid of fcPortOutputDirectionLogicalTerminationPointList) {
      const httpLtpUuidList = await LogicalTerminationPoint.getServerLtpListAsync(opLtpUuid);
      const httpClientLtpUuid = httpLtpUuidList[0];
      let applicationName = 'api';
      const path = await OperationClientInterface.getOperationNameAsync(opLtpUuid);
      const key = await OperationClientInterface.getOperationKeyAsync(opLtpUuid)
      let url = "";
      let tcpConn = "";
      
      applicationName = "ElasticSearch";
      tcpConn = await getTcpClientConnectionInfoAsync(opLtpUuid);
      url = tcpConn + correctUrl;
      
      const applicationNameData = applicationName === undefined ? {
          applicationName: null,
          httpClientLtpUuid,
          url: null, key: null
      } : {
          applicationName,
          httpClientLtpUuid,
          url, key
      };
      applicationNameList.push(applicationNameData);      
  }
  return applicationNameList;
}

async function RequestForListOfActualDeviceEquipmentCausesReadingFromCache(mountName){
  
  const forwardingName = "RequestForListOfActualDeviceEquipmentCausesReadingFromCache";
  const forwardingConstruct = await ForwardingDomain.getForwardingConstructForTheForwardingNameAsync(forwardingName);
 // const forwardingConstruct1 = await ForwardingDomain.

  let fcPortOutputDirectionLogicalTerminationPointList = [];
  const fcPortList = forwardingConstruct[onfAttributes.FORWARDING_CONSTRUCT.FC_PORT];
  for (const fcPort of fcPortList) {
      const portDirection = fcPort[onfAttributes.FC_PORT.PORT_DIRECTION];
      if (FcPort.portDirectionEnum.OUTPUT === portDirection) {
          fcPortOutputDirectionLogicalTerminationPointList.push(fcPort[onfAttributes.FC_PORT.LOGICAL_TERMINATION_POINT]);
      }
  }

  let applicationNameList = [];
//let urlForOdl = "/rests/data/network-topology:network-topology/topology=topology-netconf";
//let urlForOdl = "/rests/data/network-topology:network-topology?fields=topology/node(node-id;netconf-node-topology:connection-status)"
let urlForEs = "/control-construct={mountName}?fields=top-level-equipment;equipment(uuid;actual-equipment(manufactured-thing(equipment-type(type-name))))"
let correctUrl = urlForEs.replace("{mountName}", mountName);
for (const opLtpUuid of fcPortOutputDirectionLogicalTerminationPointList) {
    const httpLtpUuidList = await LogicalTerminationPoint.getServerLtpListAsync(opLtpUuid);
    const httpClientLtpUuid = httpLtpUuidList[0];
    let applicationName = 'api';
    const path = await OperationClientInterface.getOperationNameAsync(opLtpUuid);
    const key = await OperationClientInterface.getOperationKeyAsync(opLtpUuid)
    let url = "";
    let tcpConn = "";
    
    applicationName = "ElasticSearch";
    tcpConn = await getTcpClientConnectionInfoAsync(opLtpUuid);
    url = tcpConn + correctUrl;
    
    const applicationNameData = applicationName === undefined ? {
        applicationName: null,
        httpClientLtpUuid,
        url: null, key: null
    } : {
        applicationName,
        httpClientLtpUuid,
        url, key
    };
    applicationNameList.push(applicationNameData);      
}
return applicationNameList;
}

/**
 * Records a request
 *
 * body controlconstruct 
 * no response value expected for this operation
 **/
async function recordRequest(body, cc) {
  let indexAlias = await getIndexAliasAsync();
  let client = await elasticsearchService.getClient(false);
  let startTime = process.hrtime();
  let result = await client.index({
    index: indexAlias,
    id: cc,
    body: body
  });
  let backendTime = process.hrtime(startTime);
  if (result.body.result == 'created' || result.body.result == 'updated') {
    return { "took": backendTime[0] * 1000 + backendTime[1] / 1000000 };
  }
}

/**
 * Read from ES
 *
 * response value expected for this operation
 **/
async function ReadRecords(cc) {
  let size = 100;
  let from = 0;
  let query = {

    term: {
      _id: cc
    }

  };
  let indexAlias = await getIndexAliasAsync();
  let client = await elasticsearchService.getClient(false);
  const result = await client.search({
    index: indexAlias,
    body: {
      query: query
    }
  });
  const resultArray = createResultArray(result);
  return (resultArray[0])
}


// Function to modify UUID to mountName+UUID
function modificaUUID(obj, mountName) {
  for (const key in obj) {
    if (typeof obj[key] === 'object') {
      // if the value is an object, recall the function recursively
      modificaUUID(obj[key], mountName);
    } else if (key === 'uuid' || key === 'local-id') {
      obj[key] = mountName + "+" + obj[key];
    }
  }
}

function modifyUrlConcatenateMountNamePlusUuid(url, mountname) {
  const urlParts = url.split("?fields=");
  const myFields = urlParts[1];
  // Split the url using = as delimitator 
  const parts = urlParts[0].split('=');

  // Modify the values
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].indexOf("+") == -1) {
      parts[i] = mountname + "+" + parts[i];
    }
  }

  // Reconstruct the string
  let modifiedString = parts.join('=');
  if (myFields != undefined) {
    modifiedString = modifiedString + "?fields=" + myFields;
  }
  return modifiedString;

}

function notFoundError() {
  const myJson = {
    "code": 404,
    "message": "not found"
  };
  return myJson;
}

function Error(code, message) {
  const myJson = {
    "code": code,
    "message": message
  };
  return myJson;
}

function formatUrlForOdl(url) {
  const segments = url.split("/");
  let newSegments = [];
  // loop over segments
  for (const segment of segments) {
    const parts = segment.split("+");
    if (parts.length > 1) {
      if (parts[0].indexOf("control-construct") != -1) {
        newSegments.push(parts[0]);
      } else {
        newSegments.push(parts[0].split("=")[0] + "=" + parts[1]);
      }
    } else {
      newSegments.push(segment);
    }
  }
  let newUrl = newSegments.join("/");
  return newUrl;
}

function decodeMountName(url, cc) {
  let response = [];
  let responseData = null;
  let regex = "";
  let specialChars = "";
  let extractedValue = "";
  if (cc) {
    regex = /control-construct=([^?&]*)(\?fields|$)?/;
    specialChars = /[^a-zA-Z0-9+]/;
  } else {
    regex = /control-construct=([^/]+)\/?/;
    specialChars = /[^a-zA-Z0-9+]/;
  }
  const match = decodeURIComponent(url).match(regex);
 
  if (match) {
    if (cc){
      extractedValue = match[1];
      if (!match[2]) {
          const startIndex = url.indexOf("control-construct=") + "control-construct=".length;
          extractedValue = url.substring(startIndex);
      } 
    } else {
        extractedValue = match[1];
    }
    if (!specialChars.test(extractedValue)) {
      if (extractedValue.indexOf("+") != -1){
        let parts = extractedValue.split("+");
        if (parts[1] != "" && parts[1] == parts[0]){
          return parts[0];
        } else {
          responseData = {
            code:"400",
            message: "Control-construct must not contain special char"
          }
          response.push(responseData);
          return response;  
        }
      } else {
        return extractedValue;
      }
    } else {
      responseData = {
        code:"400",
        message: "Control-construct must not contain special char"
      }
      response.push(responseData);
      return response;
    }
  } else {
    responseData = {
      code:"400",
      message: "no match found or wrong char at the end of the string"
    }
    response.push(responseData);
    return response;
  }
}