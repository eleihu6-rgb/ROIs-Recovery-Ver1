#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramBuddyParser::init(vector<string>& headers) {}


static vector<string> tmProgramBuddyDefaultHeaders = { "id", "tmProgramId", "crewId", "buddyId", "lastModified", "modifiedBy" };
vector<string>& tmProgramBuddyParser::getDefaultHeaders() {
	return tmProgramBuddyDefaultHeaders;
}

void* tmProgramBuddyParser::createInstance() {
	return new TmProgramBuddy();
}

void tmProgramBuddyParser::deleteInstance(void* obj) {
	delete (TmProgramBuddy*)obj;
}

string tmProgramBuddyParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramBuddy* ref = (TmProgramBuddy*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmProgramId") { ss << ref->tmProgramId << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "buddyId") { ss << ref->buddyId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramBuddy", headers[i]); }
	}
	return ss.str();
}

void tmProgramBuddyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramBuddy* ref = (TmProgramBuddy*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmProgramId") { ref->tmProgramId = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "buddyId") { ref->buddyId = value; }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "buddyName") {}
	else { logUnkonwnField("tmProgramBuddy", headers[index]); }
}

