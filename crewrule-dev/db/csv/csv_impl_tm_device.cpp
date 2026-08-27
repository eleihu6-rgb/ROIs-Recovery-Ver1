#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmDeviceParser::init(vector<string>& headers) {}


static vector<string> tmDeviceDefaultHeaders = { "id","resourceCode","resourceType","resourceDesc","facilityName","port","facilityAddress","telephone","roomCapacity","slotCode","deviceType","fleet","fleetGrp","publishStatus","simId","lastModified","modifiedBy", "effDt", "expDt" };
vector<string>& tmDeviceParser::getDefaultHeaders() {
	return tmDeviceDefaultHeaders;
}

void* tmDeviceParser::createInstance() {
	return new TmDevice();
}

void tmDeviceParser::deleteInstance(void* obj) {
	delete (TmDevice*)obj;
}

string tmDeviceParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmDevice * ref = (TmDevice *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "resourceCode") { ss << ref->resourceCode << "^"; }
		else if (headers[i] == "resourceType") { ss << ref->resourceType << "^"; }
		else if (headers[i] == "resourceDesc") { ss << ref->resourceDesc << "^"; }
		else if (headers[i] == "facilityName") { ss << ref->facilityName << "^"; }
		else if (headers[i] == "port") { ss << ref->port << "^"; }
		else if (headers[i] == "facilityAddress") { ss << ref->facilityAddress << "^"; }
		else if (headers[i] == "telephone") { ss << ref->telephone << "^"; }
		else if (headers[i] == "roomCapacity") { ss << ref->roomCapacity << "^"; }
		else if (headers[i] == "slotCode") { ss << ref->slotCode << "^"; }
		else if (headers[i] == "deviceType") { ss << ref->deviceType << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "fleetGrp") { ss << ref->fleetGrp << "^"; }
		else if (headers[i] == "publishStatus") { ss << ((ref->publishStatus == -1) ? "" : std::to_string(ref->publishStatus)) << "^"; }
		else if (headers[i] == "simId") { ss << ref->simId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmDevice", headers[i]); }
	}
	return ss.str();
}

void tmDeviceParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmDevice * ref = (TmDevice *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "resourceCode") { ref->resourceCode = value; }
	else if (headers[index] == "resourceType") { 
		ref->resourceType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value);
		if (!ref->resourceType.empty())
			split(ref->resourceType, '|', ref->resourceTypes);
	}
	else if (headers[index] == "resourceDesc") { 
		ref->resourceDesc = value;
		if (!ref->resourceDesc.empty()) {
			ref->deviceType = strToUpper(ref->resourceDesc)[0]; //resourceDesc第一个字母大写即deviceType
		}
	}
	else if (headers[index] == "facilityName") { ref->facilityName = value; }
	else if (headers[index] == "port") { ref->port = value; }
	else if (headers[index] == "facilityAddress") { ref->facilityAddress = value; }
	else if (headers[index] == "telephone") { ref->telephone = value; }
	else if (headers[index] == "roomCapacity") { ref->roomCapacity = atoi(value); }
	else if (headers[index] == "slotCode") { ref->slotCode = value; }
	else if (headers[index] == "deviceType") {  }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "fleetGrp") { ref->fleetGrp = value; }
	else if (headers[index] == "publishStatus") { ref->publishStatus = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "simId") { ref->simId = value; }
	
	else if (headers[index] == "hisResourceCode") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "effDt") {
		ref->effectiveDateLoc = (value == NULL || strlen(value) == 0) ? 0 : utcStrToUtc(value);
	}
	else if (headers[index] == "expDt") {
		ref->expirationDateLoc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value);
	}
	else { logUnkonwnField("tmDevice", headers[index]); }
}

