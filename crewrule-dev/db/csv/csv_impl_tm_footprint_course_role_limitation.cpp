#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseRoleLimitationParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseRoleLimitationDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "footprintCourseRoleId", "limitOption", "limitSeq", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseRoleLimitationParser::getDefaultHeaders() {
	return tmFootprintCourseRoleLimitationDefaultHeaders;
}

void* tmFootprintCourseRoleLimitationParser::createInstance() {
	return new TmFootprintCourseRoleLimitation();
}

void tmFootprintCourseRoleLimitationParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseRoleLimitation*)obj;
}

string tmFootprintCourseRoleLimitationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseRoleLimitation* ref = (TmFootprintCourseRoleLimitation*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "footprintCourseRoleId") { ss << ref->footprintCourseRoleId << "^"; }
		else if (headers[i] == "limitOption") { ss << ref->limitOption << "^"; }
		else if (headers[i] == "limitSeq") { ss << ref->limitSeq << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("TmFootprintCourseRoleLimitation", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseRoleLimitationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseRoleLimitation* ref = (TmFootprintCourseRoleLimitation*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
	else if (headers[index] == "footprintCourseRoleId") { ref->footprintCourseRoleId = atoll(value); }
	else if (headers[index] == "limitOption") { ref->limitOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "limitSeq") { 
		ref->limitSeq = value;
		if (!ref->limitSeq.empty() && ref->limitSeq != "*") {
			split(ref->limitSeq, '|', ref->limitCourseSeqs);
		}
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("TmFootprintCourseRoleLimitation", headers[index]); }
}

