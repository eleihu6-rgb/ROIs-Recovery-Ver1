#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmDeviceTimeParser::init(vector<string>& headers) {}


static vector<string> tmDeviceTimeDefaultHeaders = { "id", "source","resourceCode","startTime","endTime","startDate","endDate", "startTimeUtc", "endTimeUtc", "startTimeLoc", "endTimeLoc", "courseCodes", "footprintNames", "peopleLimit","status","createTime","operationReason","lastModified","modifiedBy" };
vector<string>& tmDeviceTimeParser::getDefaultHeaders() {
	return tmDeviceTimeDefaultHeaders;
}

void* tmDeviceTimeParser::createInstance() {
	return new TmDeviceTime();
}

void tmDeviceTimeParser::deleteInstance(void* obj) {
	delete (TmDeviceTime*)obj;
}

string tmDeviceTimeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmDeviceTime * ref = (TmDeviceTime *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "resourceCode") { ss << ref->resourceCode << "^"; }
		else if (headers[i] == "startTime") { ss << ref->startTime << "^"; }
		else if (headers[i] == "endTime") { ss << ref->endTime << "^"; }
		else if (headers[i] == "startDate") { ss << ref->startDate << "^"; }
		else if (headers[i] == "endDate") { ss << ref->endDate << "^"; }
		else if (headers[i] == "startTimeUtc") { ss << ref->startTimeUtcStr << "^"; }
		else if (headers[i] == "endTimeUtc") { ss << ref->endTimeUtcStr << "^"; }
		else if (headers[i] == "startTimeLoc") { ss << ref->startTimeLocStr << "^"; }
		else if (headers[i] == "endTimeLoc") { ss << ref->endTimeLocStr << "^"; }
		else if (headers[i] == "courseCodes") { ss << ref->courseCodes << "^"; }
		else if (headers[i] == "footprintNames") { ss << ref->footprintNames << "^"; }
		else if (headers[i] == "peopleLimit") { ss << ref->peopleLimit << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "operationReason") { ss << ref->operationReason << "^"; }
		else if (headers[i] == "createTime") { ss << utcToUtcString(ref->createTime) << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmDeviceTime", headers[i]); }
	}
	return ss.str();
}

void tmDeviceTimeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmDeviceTime * ref = (TmDeviceTime *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "source" && !(value == nullptr || value[0] == '\0') ) { ref->source = value; }
	else if (headers[index] == "resourceCode") { ref->resourceCode = value; }
	else if (headers[index] == "startTime") { 
		ref->startTime = value;  
		ref->startTimeMinutes = hhmmToMinutes(value); 
		ref->startTimeMinutes = ref->startTimeMinutes < 0 ? 0 : ref->startTimeMinutes;
	}
	else if (headers[index] == "endTime") { 
		ref->endTime = value; 
		ref->endTimeMinutes = hhmmToMinutes(value);	
		ref->endTimeMinutes = ref->endTimeMinutes < 0 ? 0 : ref->endTimeMinutes;
	}
	else if (headers[index] == "startDate") { 
		ref->startDate = value;  
		ref->startDateLoc = utcStrToUtc(value); 
	}
	else if (headers[index] == "endDate") { 
		ref->endDate = value; 
		ref->endDateLoc = utcStrToUtc(value);
	}
	else if (headers[index] == "startTimeUtc") {
		ref->startTimeUtcStr = value;
		ref->startTimeUtc = utcStrToUtc(value);
	}
	else if (headers[index] == "endTimeUtc") {
		ref->endTimeUtcStr = value;
		ref->endTimeUtc = utcStrToUtc(value);
	}
	else if (headers[index] == "startTimeLoc") {
		ref->startTimeLocStr = value;
		ref->startTimeLoc = utcStrToUtc(value);
	}
	else if (headers[index] == "endTimeLoc") {
		ref->endTimeLocStr = value;
		ref->endTimeLoc = utcStrToUtc(value);
	}
	else if (headers[index] == "courseCodes") {
		ref->courseCodes = value;
		if( value != NULL && strlen(value) > 0) {
			split(value, '|', ref->courseCodeList);
		}
	}
	else if (headers[index] == "footprintNames") {
		ref->footprintNames = value;
		if( value != NULL && strlen(value) > 0) {
			split(value, '|', ref->footprintNameList);
		}
	}
	else if (headers[index] == "peopleLimit") { ref->peopleLimit = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "status") { 
		ref->status = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value);
	}
	else if (headers[index] == "operationReason") { ref->operationReason = value; }
	else if (headers[index] == "memo") {}
	else if (headers[index] == "createTime") { }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmDeviceTime", headers[index]); }
}

