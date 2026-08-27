#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseInstructorParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseInstructorDefaultHeaders = { "id", "source","programCourseId","crewId","role","rosterId","rosterGroundId","fltId","groupId","resourceCode", "startTime", "endTime", "courseId", "publishFlag","rfAssignment","subTmProgramCourseId", "modifiedBy","lastModified" };
vector<string>& tmProgramCourseInstructorParser::getDefaultHeaders() {
	return tmProgramCourseInstructorDefaultHeaders;
}

void* tmProgramCourseInstructorParser::createInstance() {
	return new TmProgramCourseInstructor();
}

void tmProgramCourseInstructorParser::deleteInstance(void* obj) {
	delete (TmProgramCourseInstructor*)obj;
}

string tmProgramCourseInstructorParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseInstructor * ref = (TmProgramCourseInstructor *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "rosterId") {
			// 后端要求，如果为0则不输出
			if (ref->rosterId != 0) ss << ref->rosterId;
			ss << "^";
		} else if (headers[i] == "rosterGroundId") {
			// 后端要求，如果为0则不输出
			if (ref->rosterGroundId != 0) ss << ref->rosterGroundId;
			ss << "^";
		}
		else if (headers[i] == "fltId") {
			// 后端要求，如果为0则不输出
			if (ref->fltId != 0) ss << ref->fltId;
			ss << "^";
		}
		else if (headers[i] == "rfAssignment") { ss << ref->rfAssignment << "^"; }
		else if (headers[i] == "groupId") { ss << ref->groupId << "^"; }
		else if (headers[i] == "resourceCode") { ss << ref->resourceCode << "^"; }
		else if (headers[i] == "startTime") { ss << utcToUtcTzString(ref->startTime) << "^"; }
		else if (headers[i] == "endTime") { ss << utcToUtcTzString(ref->endTime) << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "publishFlag") { ss << ref->publishFlag << "^"; }
		else if (headers[i] == "subTmProgramCourseId") { ss << ref->subTmProgramCourseId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseInstructor", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseInstructorParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseInstructor * ref = (TmProgramCourseInstructor *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "source" && !(value == nullptr || value[0] == '\0') ) { ref->source = value; }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "rosterGroundId") { ref->rosterGroundId = atoll(value); }
	else if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "rfAssignment") { ref->rfAssignment = value; }
	else if (headers[index] == "groupId") { ref->groupId = value; }
	else if (headers[index] == "resourceCode") { ref->resourceCode = value; }
	else if (headers[index] == "startTime") { ref->startTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "endTime") { ref->endTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "publishFlag") { ref->publishFlag = atoi(value); }
	else if (headers[index] == "subTmProgramCourseId") { ref->subTmProgramCourseId = atoll(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "resourceCode") {}
	else if (headers[index] == "startTime") {}
	else if (headers[index] == "endTime") {}
	else if (headers[index] == "courseId") {}
	else if (headers[index] == "publishFlag") {}
	else { logUnkonwnField("tmProgramCourseInstructor", headers[index]); }
}

