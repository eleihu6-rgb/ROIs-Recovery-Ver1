#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewOnFlightParser::init(vector<string>& headers) {}


static vector<string> crewOnFlightDefaultHeaders = { "fltId", "crewId", "actingRank", "pairingId", "assignment", "primeActivity", "role", "subRole", "seqOrder", "source","accState","accTimezone","isAgreeWork","exceptionCode"};
vector<string>& crewOnFlightParser::getDefaultHeaders() {
	return crewOnFlightDefaultHeaders;
}

void* crewOnFlightParser::createInstance() {
	return new csvCrewOnFlight();
}

void crewOnFlightParser::deleteInstance(void* obj) {
	delete (csvCrewOnFlight*)obj;
}

string crewOnFlightParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvCrewOnFlight * ref = (csvCrewOnFlight *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "fltId") { ss << ref->fltId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->pairingId << "^"; }
		else if (headers[i] == "assignment") { ss << ref->assignment << "^"; }
		else if (headers[i] == "primeActivity") { ss << ref->pairingPrimeActivity << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "subRole") { ss << ref->subRole << "^"; }
		else if (headers[i] == "seqOrder") { ss << ref->seqOrder << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "accState") { ss << ref->accState << "^"; }
		else if (headers[i] == "accTimezone") { ss << ref->accTimezone << "^"; }
		else if (headers[i] == "isAgreeWork") { ss << (ref->isAgreeWork ? "true" : "false") << "^"; }
		else if (headers[i] == "exceptionCode") { ss << ref->exceptionCode << "^"; }

		else { logUnkonwnField("crew_on_flight", headers[i]); }
	}
	return ss.str();
}

void crewOnFlightParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvCrewOnFlight * ref = (csvCrewOnFlight *)obj;

	if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "pairingId") { ref->pairingId = atoll(value); }
	else if (headers[index] == "assignment") { ref->assignment = value; }
	else if (headers[index] == "primeActivity") { ref->pairingPrimeActivity = value; }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "subRole") { ref->subRole = value; }
	else if (headers[index] == "activeRank") { ref->activeRank = value; }
	else if (headers[index] == "seqOrder") {  }
	else if (headers[index] == "position") { ref->position = value; }
	else if (headers[index] == "checkType") { ref->checkType = value; }
	else if (headers[index] == "tsFlag") { ref->tsFlag = value; split(ref->tsFlag.c_str(), '|', ref->tsFlags); }
	else if (headers[index] == "id") {  }
	else if (headers[index] == "scenarioId") {  }
	else if (headers[index] == "dutyId") { ref->dutyId = atoll(value); }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "fltDt") { ref->fltDt = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "source") { ref->source = value; }

	else if (headers[index] == "resourceCode") { ref->resourceCode = value; }
	else if (headers[index] == "groupId") { ref->groupId = value; }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "parentTmProgramCourseId") { ref->parentTmProgramCourseId = atoll(value); }
	else if (headers[index] == "courseCode") { ref->courseCode = value; }
	else if (headers[index] == "isExtraCourse") { ref->isExtraCourse = (atoi(value) == 1); }
	else if (headers[index] == "subTmProgramCourseId") { ref->subTmProgramCourseId = atoll(value); }
	else if (headers[index] == "subCourseCode") { ref->subCourseCode = value; }
	else if (headers[index] == "subParentTmProgramCourseId") { ref->subParentTmProgramCourseId = atoll(value); }

	else if (headers[index] == "seqOrderSource") {}
	else if (headers[index] == "subGroupId") {}
	else if (headers[index] == "displayOrder") {}
	else if (headers[index] == "remark") {}
	else if (headers[index] == "inFlightDuty") {}
	else if (headers[index] == "orderCIC") {}
	else if (headers[index] == "emQuiz") {}

	else if (headers[index] == "accState") { ref->accState = value; }
	else if (headers[index] == "accTimezone") { ref->accTimezone = atoi(value); }

	else if (headers[index] == "isAgreeWork") { ref->isAgreeWork = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "exceptionCode") {
		ref->exceptionCode = value;
		if (!ref->exceptionCode.empty()) {
			split(ref->exceptionCode.c_str(), '|', ref->exceptionCodes);
		}
	}
	else { logUnkonwnField("crew_on_flight", headers[index]); }
}

