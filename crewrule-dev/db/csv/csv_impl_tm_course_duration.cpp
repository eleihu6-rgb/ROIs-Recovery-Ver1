#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseDurationParser::init(vector<string>& headers) {}


static vector<string> tmCourseDurationDefaultHeaders = { "id", "courseId", "num", "duration", "lastModified", "modifiedBy" };
vector<string>& tmCourseDurationParser::getDefaultHeaders() {
	return tmCourseDurationDefaultHeaders;
}

void* tmCourseDurationParser::createInstance() {
	return new TmCourseDuration();
}

void tmCourseDurationParser::deleteInstance(void* obj) {
	delete (TmCourseDuration*)obj;
}

string tmCourseDurationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseDuration* ref = (TmCourseDuration*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "num") { ss << ref->num << "^"; }
		else if (headers[i] == "duration") { ss << ref->duration << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseDuration", headers[i]); }
	}
	return ss.str();
}

void tmCourseDurationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseDuration* ref = (TmCourseDuration*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "num") { 
		ref->num = (value == NULL || strlen(value) == 0) ? INT_MIN : atoi(value);
	}
	else if (headers[index] == "duration") { 
		ref->duration = (value == NULL || strlen(value) == 0) ? INT_MIN : atoi(value);
	}
	else if (headers[index] == "modifiedBy") {  }
	else if (headers[index] == "lastModified") {  }
	else { logUnkonwnField("tmCourseDuration", headers[index]); }
}

