#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void assignmentGroupMapParser::init(vector<string>& headers) {}


static vector<string> assignmentGroupMapDefaultHeaders = { "assignmentGroupId", "assignmentId", "lastModified", "modifiedBy", "id" };
vector<string>& assignmentGroupMapParser::getDefaultHeaders() {
	return assignmentGroupMapDefaultHeaders;
}

void* assignmentGroupMapParser::createInstance() {
	return new ASSIGNMENT_GROUP_MAP();
}

void assignmentGroupMapParser::deleteInstance(void* obj) {
	delete (ASSIGNMENT_GROUP_MAP*)obj;
}

string assignmentGroupMapParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ASSIGNMENT_GROUP_MAP * ref = (ASSIGNMENT_GROUP_MAP *)obj;
	//,
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "assignmentGroupId") { ss << ref->assignGrpId << "^"; }
		else if (headers[i] == "assignmentId") { ss << ref->assignId << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("assignment_group_map", headers[i]); }
	}
	return ss.str();
}

void assignmentGroupMapParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ASSIGNMENT_GROUP_MAP * ref = (ASSIGNMENT_GROUP_MAP *)obj;

	if (headers[index] == "assignmentGroupId") { ref->assignGrpId = atoll(value); }
	else if (headers[index] == "assignmentId") { ref->assignId = atoll(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("assignment_group_map", headers[index]); }
}

