#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseRoleDeviceParser::init(vector<string>& headers) {}


static vector<string> tmCourseRoleDeviceDefaultHeaders = { "id","tmCourseRoleId","tmCourseRoleBaseId","option","deviceType","deviceCodes","lastModified","modifiedBy" };
vector<string>& tmCourseRoleDeviceParser::getDefaultHeaders() {
	return tmCourseRoleDeviceDefaultHeaders;
}

void* tmCourseRoleDeviceParser::createInstance() {
	return new TmCourseRoleDevice();
}

void tmCourseRoleDeviceParser::deleteInstance(void* obj) {
	delete (TmCourseRoleDevice*)obj;
}

string tmCourseRoleDeviceParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseRoleDevice * ref = (TmCourseRoleDevice *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmCourseRoleId") { ss << ref->tmCourseRoleId << "^"; }
		else if (headers[i] == "tmCourseRoleBaseId") { ss << ref->tmCourseRoleBaseId << "^"; }
		else if (headers[i] == "option") { ss << ref->option << "^"; }
		else if (headers[i] == "deviceType") { ss << ref->deviceType << "^"; }
		else if (headers[i] == "deviceCodes") { ss << ref->deviceCode << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseRoleDevice", headers[i]); }
	}
	return ss.str();
}

void tmCourseRoleDeviceParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseRoleDevice * ref = (TmCourseRoleDevice *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmCourseRoleId") { ref->tmCourseRoleId = atoll(value); }
	else if (headers[index] == "tmCourseRoleBaseId") { ref->tmCourseRoleBaseId = atoll(value); }
	else if (headers[index] == "option") { ref->option = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "deviceType") { 
		ref->deviceType = (value == NULL || strlen(value) == 0) ? "" : value;
		if (!ref->deviceType.empty())
			split(ref->deviceType, '|', ref->deviceTypes);
	}
	else if (headers[index] == "deviceCodes") { 
		ref->deviceCode = (value == NULL || strlen(value) == 0) ? "" : value;
		if (!ref->deviceCode.empty())
			split(ref->deviceCode, '|', ref->deviceCodes);
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmCourseRoleDevice", headers[index]); }
}

