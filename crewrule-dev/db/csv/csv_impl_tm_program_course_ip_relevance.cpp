#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseIpRelevanceParser::init(vector<string>& headers) {}

static vector<string> tmProgramCourseIpRelevanceDefaultHeaders = { "id","programCourseId","programCourseInstructorId","lastModified","modifiedBy" };
vector<string>& tmProgramCourseIpRelevanceParser::getDefaultHeaders() {
	return tmProgramCourseIpRelevanceDefaultHeaders;
}

void* tmProgramCourseIpRelevanceParser::createInstance() {
	return new TmProgramCourseIpRelevance();
}

void tmProgramCourseIpRelevanceParser::deleteInstance(void* obj) {
	delete (TmProgramCourseIpRelevance*)obj;
}

string tmProgramCourseIpRelevanceParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseIpRelevance * ref = (TmProgramCourseIpRelevance *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programCourseInstructorId") { ss << ref->programCourseInstructorId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseIpRelevance", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseIpRelevanceParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseIpRelevance * ref = (TmProgramCourseIpRelevance *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programCourseInstructorId") { ref->programCourseInstructorId = atoll(value); }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmProgramCourseIpRelevance", headers[index]); }
}

