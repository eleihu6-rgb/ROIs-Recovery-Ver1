#include <sstream>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewEntitlementParser::init(vector<string>& headers) {}


//mantis#2228, 增加crew_base.isPrimeEntitlement读写
string crewEntitlementParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_ENTITLEMENT * ref = (CREW_ENTITLEMENT *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "entitlementType") { ss << ref->type << "^"; }
		else if (headers[i] == "entitlementYear") { ss << ref->year << "^"; }
		else if (headers[i] == "entitlement") { ss << ref->entitlement << "^"; }
		else if (headers[i] == "used") { ss << ref->used << "^"; }
		else if (headers[i] == "effDt") { ss << ref->used << "^"; }
		else if (headers[i] == "expDt") { ss << ref->used << "^"; }
		else { logUnkonwnField("crew_entitlement", headers[i]); }
	}
	return ss.str();
}

//mantis#2228, 增加crew_base.isPrimeEntitlement读写
void crewEntitlementParser::fromCsv(vector<string>& headers, int i, char* value, void* obj) {
	CREW_ENTITLEMENT * ref = (CREW_ENTITLEMENT *)obj;

	if (headers[i] == "id") {}
	else if (headers[i] == "crewId") { ref->crewId = value ; }
	else if (headers[i] == "airline") { ref->airline = value; }
	else if (headers[i] == "entitlementType") { ref->type = value; }
	else if (headers[i] == "entitlementYear") { ref->year = atoi(value); }
	else if (headers[i] == "entitlement") { ref->entitlement = atof(value); }
	else if (headers[i] == "used") { ref->used = atof(value); }
	else if (headers[i] == "carryOver") { ref->carryOver = atoi(value); }
	else if (headers[i] == "carryOverDt") { ref->carrtOverDt = utcStrToUtc(value); }
	else if (headers[i] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[i] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[i] == "lastModified") {}
	else if (headers[i] == "modifiedBy") {}
	else if (headers[i] == "filiale") {}
	else if (headers[i] == "crewTeam") {}
	else if (headers[i] == "crewRank") {}
	else if (headers[i] == "crewBase") {}
	else if (headers[i] == "crewFleet") {}
	else if (headers[i] == "balance") {}
	else if (headers[i] == "freeze") {}
	else if (headers[i] == "unfrozen") {}
	else if (headers[i] == "groupId") {}

	else if (headers[i] == "operator") {}
	else if (headers[i] == "requestCode") {}
	else if (headers[i] == "requestName") {}
	else if (headers[i] == "requestType") {}

	else { logUnkonwnField("crew_entitlement", headers[i]); }
}
void* crewEntitlementParser::createInstance() {
	return new CREW_ENTITLEMENT();
}

void crewEntitlementParser::deleteInstance(void* obj) {
	delete (CREW_ENTITLEMENT*)obj;
}

static vector<string> crewEntitlementDefaultHeaders = { "id", "airline", "crewId", "entitlementType", "entitlementYear", "entitlement", "used", "effDt", "expDt" };
vector<string>& crewEntitlementParser::getDefaultHeaders() {
	return crewEntitlementDefaultHeaders;
}