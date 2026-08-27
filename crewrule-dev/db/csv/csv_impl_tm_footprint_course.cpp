#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseDefaultHeaders = { "id", "modifiedBy", "lastModified", "footprintId", "courseId", "phase", "seq", "duration", "unit", "totalSession", "assignment", "courseType", "sector", "simioe", "coursePreposition", "courseLevel" };
vector<string>& tmFootprintCourseParser::getDefaultHeaders() {
	return tmFootprintCourseDefaultHeaders;
}

void* tmFootprintCourseParser::createInstance() {
	return new TmFootprintCourse();
}

void tmFootprintCourseParser::deleteInstance(void* obj) {
	delete (TmFootprintCourse*)obj;
}

string tmFootprintCourseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourse * ref = (TmFootprintCourse *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "phase") { ss << ref->phase << "^"; }
		else if (headers[i] == "seq") { ss << ref->seq << "^"; }
		else if (headers[i] == "duration") { ss << ref->duration << "^"; }
		else if (headers[i] == "unit") { ss << ref->unit << "^"; }
		else if (headers[i] == "totalSession") { ss << ref->totalSession << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "courseType") { ss << ref->courseType << "^"; }
		else if (headers[i] == "sector") { ss << ref->sector << "^"; }
		else if (headers[i] == "simioe") { ss << ref->simioe << "^"; }
		else if (headers[i] == "coursePreposition") { ss << ref->coursePreposition << "^"; }
		else if (headers[i] == "courseLevel") { ss << ref->courseLevel << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmFootprintCourse", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourse * ref = (TmFootprintCourse *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "phase") { ref->phase = value; }
	else if (headers[index] == "seq") { ref->seq = atoi(value); }
	else if (headers[index] == "duration") { ref->duration = atoi(value); }
	else if (headers[index] == "unit") { ref->unit = value; }
	else if (headers[index] == "totalSession") { ref->totalSession = atoi(value); }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "courseType") { ref->courseType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "sector") { ref->sector = atoi(value); }
	else if (headers[index] == "simioe") { ref->simioe = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "coursePreposition") { ref->coursePreposition = value; }
	else if (headers[index] == "courseLevel") { ref->courseLevel = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "externalCourseId") {}
	else { logUnkonwnField("tmFootprintCourse", headers[index]); }
}

