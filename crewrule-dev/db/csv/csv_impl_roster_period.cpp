#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rosterPeriodParser::init(vector<string>& headers) {}


static vector<string> rosterPeriodDefaultHeaders = { "id", "year", "name", "roster_period", "rp_start", "rp_end", "roster_publication_date", "paid_date", "lastModified", "modifiedBy" };
vector<string>& rosterPeriodParser::getDefaultHeaders() {
	return rosterPeriodDefaultHeaders;
}

void* rosterPeriodParser::createInstance() {
	return new RosterPeriod();
}

void rosterPeriodParser::deleteInstance(void* obj) {
	delete (RosterPeriod*)obj;
}

string rosterPeriodParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RosterPeriod * ref = (RosterPeriod *)obj;
	//"", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "year") { ss << ref->year << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "rosterPeriod") { ss << ref->roster_period << "^"; }
		else if (headers[i] == "rpStart") { ss << ref->rp_start << "^"; }
		else if (headers[i] == "rpEnd") { ss << ref->rp_end << "^"; }
		else if (headers[i] == "rosterPublicationDate") { ss << ref->roster_publication_date << "^"; }
		else if (headers[i] == "paidDate") { ss << ref->paid_date << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("roster_period", headers[i]); }
	}
	return ss.str();
}

void rosterPeriodParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RosterPeriod * ref = (RosterPeriod *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "year") { ref->year = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "rosterPeriod") { ref->roster_period = value; }
	else if (headers[index] == "rpStart") { ref->rp_start = utcStrToUtc(value); }
	else if (headers[index] == "rpEnd") { ref->rp_end = utcStrToUtc(value); }
	else if (headers[index] == "rosterPublicationDate") { ref->roster_publication_date = utcStrToUtc(value); }
	else if (headers[index] == "paidDate") { ref->paid_date = utcStrToUtc(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lockStatus") {}
	else { logUnkonwnField("roster_period", headers[index]); }
}

