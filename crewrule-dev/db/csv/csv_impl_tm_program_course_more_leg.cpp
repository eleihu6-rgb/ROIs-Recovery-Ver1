#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include <limits>

void tmProgramCourseMoreLegParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseMoreLegDefaultHeaders = { "id","programId","tmProgramCourseId","tmProgramCoursePnrId","tmProgramCourseMoreId","legCategory","legPhase","legSector","legForce","legRange","legBefore","legAfter","legStation","legGroup","legPassenger","modifiedBy","lastModified" };
vector<string>& tmProgramCourseMoreLegParser::getDefaultHeaders() {
	return tmProgramCourseMoreLegDefaultHeaders;
}

void* tmProgramCourseMoreLegParser::createInstance() {
	return new TmProgramCourseMoreLeg();
}

void tmProgramCourseMoreLegParser::deleteInstance(void* obj) {
	delete (TmProgramCourseMoreLeg*)obj;
}

string tmProgramCourseMoreLegParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseMoreLeg* ref = (TmProgramCourseMoreLeg*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "tmProgramCourseId") { ss << ref->tmProgramCourseId << "^"; }
		else if (headers[i] == "tmProgramCoursePnrId") { ss << ref->tmProgramCoursePnrId << "^"; }
		else if (headers[i] == "tmProgramCourseMoreId") { ss << ref->tmProgramCourseMoreId << "^"; }
		else if (headers[i] == "legCategory") { ss << ref->legCategory << "^"; }
		else if (headers[i] == "legPhase") { ss << ref->legPhase << "^"; }
		else if (headers[i] == "legSector") { ss << ref->legSector << "^"; }
		else if (headers[i] == "legForce") { ss << ref->legForce << "^"; }
		else if (headers[i] == "legRange") { ss << ref->legRange << "^"; }
		else if (headers[i] == "legBefore") { ss << ref->legBefore << "^"; }
		else if (headers[i] == "legAfter") { ss << ref->legAfter << "^"; }
		else if (headers[i] == "legStation") { ss << ref->legStation << "^"; }
		else if (headers[i] == "legGroup") { ss << ref->legGroup << "^"; }
		else if (headers[i] == "legPassenger") { ss << ref->legPassenger << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseMoreLeg", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseMoreLegParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseMoreLeg* ref = (TmProgramCourseMoreLeg*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "tmProgramCoursePnrId") { ref->tmProgramCoursePnrId = atoll(value); }
	else if (headers[index] == "tmProgramCourseMoreId") { ref->tmProgramCourseMoreId = atoll(value); }
	else if (headers[index] == "legCategory") { ref->legCategory = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "legPhase") { 
		ref->legPhase = value; 
		if (!ref->legPhase.empty()) {
			split(ref->legPhase, '|', ref->legPhases);
		}
	}
	else if (headers[index] == "legSector") { ref->legSector = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "legForce") { ref->legForce = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "legRange") { ref->legRange = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "legBefore") { ref->strLegBefore = value; ref->legBefore = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "legAfter") { ref->strLegAfter = value; ref->legAfter = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "legStation") { 
		ref->legStation = value;
		if (!ref->legStation.empty()) {
			split(ref->legStation, '|', ref->legStations);
		}
	}
	else if (headers[index] == "legGroup") { 
		ref->legGroup = value; 
		if (!ref->legGroup.empty()) {
			split(ref->legGroup, '|', ref->legGroups);
		}
	}
	else if (headers[index] == "legPassenger") { ref->legPassenger = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseMoreLeg", headers[index]); }
}

