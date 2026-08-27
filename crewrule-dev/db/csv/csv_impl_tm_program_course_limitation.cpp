#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseLimitationParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseLimitationDefaultHeaders = { "id","programId","programCourseId","programPnrId","limitOption","limitSeq","startRole","endRole","modifiedBy","lastModified"};
vector<string>& tmProgramCourseLimitationParser::getDefaultHeaders() {
	return tmProgramCourseLimitationDefaultHeaders;
}

void* tmProgramCourseLimitationParser::createInstance() {
	return new TmProgramCourseLimitation();
}

void tmProgramCourseLimitationParser::deleteInstance(void* obj) {
	delete (TmProgramCourseLimitation*)obj;
}

string tmProgramCourseLimitationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseLimitation * ref = (TmProgramCourseLimitation *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "limitOption") { ss << ref->limitOption << "^"; }
		else if (headers[i] == "limitSeq") { ss << ref->limitSeq << "^"; }
		else if (headers[i] == "startRole") { ss << ref->startRole << "^"; }
		else if (headers[i] == "endRole") { ss << ref->endRole << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseLimitation", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseLimitationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseLimitation * ref = (TmProgramCourseLimitation *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
	else if (headers[index] == "limitOption") { ref->limitOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "limitSeq") { 
		ref->limitSeq = value; 
		if (!ref->limitSeq.empty() && ref->limitSeq != "*") {
			split(ref->limitSeq, '|', ref->limitCourseSeqs);
		}	
	}
	else if (headers[index] == "startRole") {
		ref->startRole = value;
		if (!ref->startRole.empty() && ref->startRole != "*") {
			split(ref->startRole, '|', ref->startRoles);
		}
	}
	else if (headers[index] == "endRole") {
		ref->endRole = value;
		if (!ref->endRole.empty() && ref->endRole != "*") {
			split(ref->endRole, '|', ref->endRoles);
		}
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseLimitation", headers[index]); }
}

