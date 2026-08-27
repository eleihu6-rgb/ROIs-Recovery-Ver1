#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseRoleLimitationParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseRoleLimitationDefaultHeaders = { "id","programId","programCourseId","programPnrId","programCourseRoleId","limitOption","limitSeq","modifiedBy","lastModified" };
vector<string>& tmProgramCourseRoleLimitationParser::getDefaultHeaders() {
	return tmProgramCourseRoleLimitationDefaultHeaders;
}

void* tmProgramCourseRoleLimitationParser::createInstance() {
	return new TmProgramCourseRoleLimitation();
}

void tmProgramCourseRoleLimitationParser::deleteInstance(void* obj) {
	delete (TmProgramCourseRoleLimitation*)obj;
}

string tmProgramCourseRoleLimitationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseRoleLimitation * ref = (TmProgramCourseRoleLimitation *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "programCourseRoleId") { ss << ref->programCourseRoleId << "^"; }
		else if (headers[i] == "limitOption") { ss << ref->limitOption << "^"; }
		else if (headers[i] == "limitSeq") { ss << ref->limitSeq << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseRoleLimitation", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseRoleLimitationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseRoleLimitation * ref = (TmProgramCourseRoleLimitation *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
	else if (headers[index] == "programCourseRoleId") { ref->programCourseRoleId = atoll(value); }
	else if (headers[index] == "limitOption") { ref->limitOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "limitSeq") { 
		ref->limitSeq = value; 
		if (!ref->limitSeq.empty() && ref->limitSeq != "*") {
			split(ref->limitSeq, '|', ref->limitCourseSeqs);
		}	
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseRoleLimitation", headers[index]); }
}

