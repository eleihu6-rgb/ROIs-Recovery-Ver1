#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void assignmentOverlappableParser::init(vector<string>& headers) {}


static vector<string> assignmentOverlappableDefaultHeaders = { "id", "assignmentGroupPrev", "assignmentPrev",
"assignmentGroupNext", "assignmentNext", "allowFullOverlap", "phase", "lastModified", "modifiedBy" };
vector<string>& assignmentOverlappableParser::getDefaultHeaders() {
	return assignmentOverlappableDefaultHeaders;
}

void* assignmentOverlappableParser::createInstance() {
	return new ASSIGNMENT_OVERLAPPABLE();
}

void assignmentOverlappableParser::deleteInstance(void* obj) {
	delete (ASSIGNMENT_OVERLAPPABLE*)obj;
}

string assignmentOverlappableParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ASSIGNMENT_OVERLAPPABLE * ref = (ASSIGNMENT_OVERLAPPABLE *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "assignmentGroupPrev") { ss << ref->assignmentGroupPrev << "^"; }
		else if (headers[i] == "assignmentPrev") { ss << ref->assignmentPrev << "^"; }
		else if (headers[i] == "assignmentGroupNext") { ss << ref->assignmentGroupNext << "^"; }
		else if (headers[i] == "assignmentNext") { ss << ref->assignmentNext << "^"; }
		else if (headers[i] == "allowFullOverlap") { ss << (ref->allowFullOverlap ? "Y" :"N") << "^"; }
		else if (headers[i] == "phase") { ss << ref->phase << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("assignment_overlappable", headers[i]); }
	}
	return ss.str();
}

void assignmentOverlappableParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ASSIGNMENT_OVERLAPPABLE * ref = (ASSIGNMENT_OVERLAPPABLE *)obj;
		if (headers[index] == "id") { ref->id = atoll(value); }
		else if (headers[index] == "assignmentGroupPrev") { ref->assignmentGroupPrev = (value); }
		else if (headers[index] == "assignmentPrev") { ref->assignmentPrev = (value); }
		else if (headers[index] == "assignmentGroupNext") { ref->assignmentGroupNext = (value); }
		else if (headers[index] == "assignmentNext") { ref->assignmentNext = (value); }	
		else if (headers[index] == "allowFullOverlap") { ref->allowFullOverlap = (0 == strcmp(value, "Y") || 0 == strcmp(value, "y")); }
		else if (headers[index] == "phase") { ref->phase = (value); }
		else if (headers[index] == "type") { ref->type = (value); }
		else if (headers[index] == "lastModified") {}
		else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("assignment_overlappable", headers[index]); }
}

