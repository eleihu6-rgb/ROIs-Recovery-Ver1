#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewCompanyRankParser::init(vector<string>& headers) {}


string crewCompanyRankParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_COMPANY_RANK * ref = (CREW_COMPANY_RANK *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "interfaceCompanyRankId") { ss << "^"; }
		else if (headers[i] == "companyRank") { ss << ref->companyRank << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else if (headers[i] == "probationEndDt") { ss << utcToUtcTzString(ref->probationEndDt) << "^"; }
		else if (headers[i] == "companyPosition") { ss << ref->companyPosition << "^"; }
		else if (headers[i] == "preCumulatedExpDays") { ss << ref->preCumulatedExpDays << "^"; }
		else if (headers[i] == "fleetSpecific") { ss << ref->fleetSpecific << "^"; }
		else if (headers[i] == "acType") { ss << ref->acType << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("crewCompanyRank", headers[i]); }
	}
	return ss.str();
}

void crewCompanyRankParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_COMPANY_RANK * ref = (CREW_COMPANY_RANK *)obj;
	if (headers[index] == "id") { }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "interfaceCompanyRankId") {}
	else if (headers[index] == "companyRank") { ref->companyRank = value; }
	else if (headers[index] == "effDt") { ref->effDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "probationEndDt") { ref->probationEndDt = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "companyPosition") { ref->companyPosition = value; }
	else if (headers[index] == "preCumulatedExpDays") { ref->preCumulatedExpDays = atoi(value); }
	else if (headers[index] == "fleetSpecific") { ref->fleetSpecific = value; }
	else if (headers[index] == "acType") { ref->acType = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "isValid") {}
	else { logUnkonwnField("crewCompanyRank", headers[index]); }
}

void* crewCompanyRankParser::createInstance() {
	return new CREW_COMPANY_RANK();
}

void crewCompanyRankParser::deleteInstance(void* obj) {
	delete (CREW_COMPANY_RANK*)obj;
}

static vector<string> crewCompanyRankDefaultHeaders = { "id","crewId","interfaceCompanyRankId","companyRank","effDt","expDt","probationEndDt","companyPosition","preCumulatedExpDays","fleetSpecific","acType","lastModified","modifiedBy" };
vector<string>& crewCompanyRankParser::getDefaultHeaders() {
	return crewCompanyRankDefaultHeaders;
}