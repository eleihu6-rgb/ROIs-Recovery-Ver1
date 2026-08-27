#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramBuddyTimeParser::init(vector<string>& headers) {}


static vector<string> tmProgramBuddyTimeDefaultHeaders = { "id", "tmProgramBuddyId", "buddyProgramId", "startTime", "endTime", "startCoursePhase", "endCoursePhase", "modifiedBy", "lastModified" };
vector<string>& tmProgramBuddyTimeParser::getDefaultHeaders() {
	return tmProgramBuddyTimeDefaultHeaders;
}

void* tmProgramBuddyTimeParser::createInstance() {
	return new TmProgramBuddyTime();
}

void tmProgramBuddyTimeParser::deleteInstance(void* obj) {
	delete (TmProgramBuddyTime*)obj;
}

string tmProgramBuddyTimeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramBuddyTime* ref = (TmProgramBuddyTime*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmProgramBuddyId") { ss << ref->tmProgramBuddyId << "^"; }
		else if (headers[i] == "buddyProgramId") { ss << ref->buddyProgramId << "^"; }
		else if (headers[i] == "startTime") { ss << ref->startTime << "^"; }
		else if (headers[i] == "endTime") { ss << ref->endTime << "^"; }
		else if (headers[i] == "startCoursePhase") { ss << ref->startCoursePhase << "^"; }
		else if (headers[i] == "endCoursePhase") { ss << ref->endCoursePhase << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
	}
	return ss.str();
}

void tmProgramBuddyTimeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramBuddyTime* ref = (TmProgramBuddyTime*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmProgramBuddyId") { ref->tmProgramBuddyId = atoll(value); }
	else if (headers[index] == "buddyProgramId") { ref->buddyProgramId = atoll(value); }
	else if (headers[index] == "startTime") { 
		ref->startTime = value;
		if (!ref->startTime.empty()) {
			if (isNumberStr(ref->startTime.c_str(), ref->startTime.length())) {
				ref->fromCourseId = atoll(value);
			}
			else {
				ref->courseStartTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value);
			}
		}
	}
	else if (headers[index] == "endTime") { 
		ref->endTime = value;
		if (!ref->endTime.empty()) {
			if (isNumberStr(ref->endTime.c_str(), ref->endTime.length())) {
				ref->toCourseId = atoll(value);
			}
			else {
				ref->courseEndTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value);
			}
		}
	}
	else if (headers[index] == "startCoursePhase") { ref->startCoursePhase = atoi(value); }
	else if (headers[index] == "endCoursePhase") { ref->endCoursePhase = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "startCourseCode") {}
	else if (headers[index] == "endCourseCode") {}
	else if (headers[index] == "startCourseSeq") {}
	else if (headers[index] == "endCourseSeq") {}
	else { logUnkonwnField("tmProgramBuddyTime", headers[index]); }
}

