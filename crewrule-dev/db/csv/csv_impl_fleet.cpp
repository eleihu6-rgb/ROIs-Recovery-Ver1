#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void fleetParser::init(vector<string>& headers) {}


static vector<string> fleetDefaultHeaders = { "id", "airline", "acType", "fleet", "description", "displayOrder", 
"fleetGrp", "isSelected", "restfacility", "ccRestfacility", "fdRestFacCnt", "ccRestFacCnt", "lastModified", "modifiedBy" };
vector<string>& fleetParser::getDefaultHeaders() {
	return fleetDefaultHeaders;
}

void* fleetParser::createInstance() {
	return new FLEET();
}

void fleetParser::deleteInstance(void* obj) {
	delete (FLEET*)obj;
}

string fleetParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	FLEET * ref = (FLEET *)obj;
	//"id", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->fleetId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "fleetGrp") { ss << ref->fleetGrp << "^"; }
		else if (headers[i] == "acType") { ss << ref->acType << "^"; }
		else if (headers[i] == "isSelected") { ss << "^"; }
		else if (headers[i] == "restfacility") { ss << ref->restfacility << "^"; }
		else if (headers[i] == "ccRestfacility") { ss << ref->ccRestfacility << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("fleet", headers[i]); }
	}
	return ss.str();
}

void fleetParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	FLEET * ref = (FLEET *)obj;
	if (headers[index] == "id") { ref->fleetId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "description") { ref->description = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "fleetGrp") { ref->fleetGrp = value; }
	else if (headers[index] == "acType") { ref->acType = value; }
	else if (headers[index] == "restfacility") { ref->restfacility = atoi(value); }
	else if (headers[index] == "ccRestFacility") { ref->ccRestfacility = atoi(value); }
	else if (headers[index] == "fdRestFacCnt") { ref->fdRestFacCnt = atoi(value); }
	else if (headers[index] == "ccRestFacCnt") { ref->ccRestFacCnt = atoi(value); }
	else if (headers[index] == "body") {}
	else if (headers[index] == "marketAcType") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("fleet", headers[index]); }
}

