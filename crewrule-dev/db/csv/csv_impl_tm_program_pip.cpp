#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramPipParser::init(vector<string>& headers) {}

static vector<string> tmProgramPipDefaultHeaders = { "id","programId","simioe","phase","pipNumber","crewIds","lastModified","modifiedBy" };
vector<string>& tmProgramPipParser::getDefaultHeaders() {
	return tmProgramPipDefaultHeaders;
}

void* tmProgramPipParser::createInstance() {
	return new TmProgramPip();
}

void tmProgramPipParser::deleteInstance(void* obj) {
	delete (TmProgramPip*)obj;
}

string tmProgramPipParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramPip * ref = (TmProgramPip *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "simioe") { ss << ref->simioe << "^"; }
		else if (headers[i] == "phase") { ss << ref->strPhase << "^"; }
		else if (headers[i] == "pipNumber") { ss << ref->pipNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramPip", headers[i]); }
	}
	return ss.str();
}

void tmProgramPipParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramPip * ref = (TmProgramPip *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "simioe") { ref->simioe = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "phase") { 
		ref->strPhase = value; 
		if (!ref->strPhase.empty() && ref->strPhase != "*") {
			split(ref->strPhase, '|', ref->phase);
		}
	}
	else if (headers[index] == "pipNumber") { ref->pipNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "crewIds") { 
		ref->strCrewIds = value; 
		if (!ref->strCrewIds.empty() && ref->strCrewIds != "*") {
			split(ref->strCrewIds, '|', ref->crewIds);
		}
	}
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmProgramPip", headers[index]); }
}

