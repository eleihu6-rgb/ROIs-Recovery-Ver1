#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramBuddyCourseParser::init(vector<string>& headers) {}


static vector<string> tmProgramBuddyCourseDefaultHeaders = { "id","programId","courseId","programBuddyId","programBuddyTimeId","modifiedBy","lastModified" };
vector<string>& tmProgramBuddyCourseParser::getDefaultHeaders() {
	return tmProgramBuddyCourseDefaultHeaders;
}

void* tmProgramBuddyCourseParser::createInstance() {
	return new TmProgramBuddyCourse();
}

void tmProgramBuddyCourseParser::deleteInstance(void* obj) {
	delete (TmProgramBuddyCourse*)obj;
}

string tmProgramBuddyCourseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramBuddyCourse* ref = (TmProgramBuddyCourse*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "programBuddyId") { ss << ref->programBuddyId << "^"; }
		else if (headers[i] == "programBuddyTimeId") { ss << ref->programBuddyTimeId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramBuddyCourse", headers[i]); }
	}
	return ss.str();
}

void tmProgramBuddyCourseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramBuddyCourse* ref = (TmProgramBuddyCourse*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "programBuddyId") { ref->programBuddyId = atoll(value); }
	else if (headers[index] == "programBuddyTimeId") { ref->programBuddyTimeId = atoll(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramBuddyCourse", headers[index]); }
}