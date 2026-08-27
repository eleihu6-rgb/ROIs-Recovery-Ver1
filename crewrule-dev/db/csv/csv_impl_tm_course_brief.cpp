#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseBriefParser::init(vector<string>& headers) {}


static vector<string> tmCourseBriefDefaultHeaders = { "id", "courseId", "briefRoles", "briefType", "briefTimes", "modifiedBy", "lastModified" };
vector<string>& tmCourseBriefParser::getDefaultHeaders() {
	return tmCourseBriefDefaultHeaders;
}

void* tmCourseBriefParser::createInstance() {
	return new TmCourseBrief();
}

void tmCourseBriefParser::deleteInstance(void* obj) {
	delete (TmCourseBrief*)obj;
}

string tmCourseBriefParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseBrief* ref = (TmCourseBrief*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "briefRoles") { ss << ref->strBriefRoles << "^"; }
		else if (headers[i] == "briefType") { ss << ref->briefType << "^"; }
		else if (headers[i] == "briefTimes") { ss << ref->briefTimes << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseBrief", headers[i]); }
	}
	return ss.str();
}

void tmCourseBriefParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseBrief* ref = (TmCourseBrief*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "briefRoles") { 
		ref->strBriefRoles = value;
		if (!ref->strBriefRoles.empty() && ref->strBriefRoles != "ALL" && ref->strBriefRoles != "*") {
			split(ref->strBriefRoles, '|', ref->briefRoles);
		}
	}
	else if (headers[index] == "briefType") { 
		ref->briefType = (value == NULL || strlen(value) == 0) ? -1 : atoi(value);
	}
	else if (headers[index] == "briefTimes") {
		ref->briefTimes = (value == NULL || strlen(value) == 0) ? -1 : atoi(value);
	}
	else if (headers[index] == "modifiedBy") {  }
	else if (headers[index] == "lastModified") {  }
	else { logUnkonwnField("tmCourseBrief", headers[index]); }
}

