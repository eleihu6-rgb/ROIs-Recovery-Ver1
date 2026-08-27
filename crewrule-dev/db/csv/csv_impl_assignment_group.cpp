#include <sstream>
#include <memory.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void assignmentGroupParser::init(vector<string>& headers) {}


static vector<string> assignmentGroupDefaultHeaders = { "id", "airline", "assignmentGroup", "name", "optimizerIndicator",
"allowOverlap", "lastModified", "modifiedBy" };
vector<string>& assignmentGroupParser::getDefaultHeaders() {
	return assignmentGroupDefaultHeaders;
}

void* assignmentGroupParser::createInstance() {
	return new ASSIGNMENT_GROUP();
}

void assignmentGroupParser::deleteInstance(void* obj) {
	delete (ASSIGNMENT_GROUP*)obj;
}

string assignmentGroupParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ASSIGNMENT_GROUP * ref = (ASSIGNMENT_GROUP *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->assignGrpId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "assignmentGroup") { ss << ref->assignGrp << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "optimizerIndicator") { ss << (ref->roIndicator == "Y" ? "true": "false") << "^"; }
		else if (headers[i] == "allowOverlap") { ss << (ref->allowOverlap ? "true": "false") << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("assignment_group", headers[i]); }
	}
	return ss.str();
}

void assignmentGroupParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ASSIGNMENT_GROUP * ref = (ASSIGNMENT_GROUP *)obj;

	if (headers[index] == "id") { ref->assignGrpId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "assignmentGroup") { ref->assignGrp = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "optimizerIndicator") { ref->roIndicator = (0 == memcmp(value, "true", 4) ? "Y": "N"); }
	else if (headers[index] == "allowOverlap") { ref->allowOverlap = (0 == memcmp(value, "true", 4)); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("assignment_group", headers[index]); }
}

