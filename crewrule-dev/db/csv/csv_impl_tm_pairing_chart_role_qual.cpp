#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmPairingChartRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmPairingChartRoleQualDefaultHeaders = { "id","pairingChartId","pairingChartRoleId","roleQualOption","roleQual","modifiedBy","lastModified" };
vector<string>& tmPairingChartRoleQualParser::getDefaultHeaders() {
	return tmPairingChartRoleQualDefaultHeaders;
}

void* tmPairingChartRoleQualParser::createInstance() {
	return new TmPairingChartRoleQual();
}

void tmPairingChartRoleQualParser::deleteInstance(void* obj) {
	delete (TmPairingChartRoleQual*)obj;
}

string tmPairingChartRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmPairingChartRoleQual * ref = (TmPairingChartRoleQual *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "pairingChartId") { ss << ref->pairingChartId << "^"; }
		else if (headers[i] == "pairingChartRoleId") { ss << ref->pairingChartRoleId << "^"; }
		else if (headers[i] == "roleQualOption") { ss << ref->roleQualOption << "^"; }
		else if (headers[i] == "roleQual") { ss << ref->roleQual << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmPairingChartRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmPairingChartRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmPairingChartRoleQual * ref = (TmPairingChartRoleQual *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "pairingChartId") { ref->pairingChartId = atoll(value); }
	else if (headers[index] == "pairingChartRoleId") { ref->pairingChartRoleId = atoll(value); }
	else if (headers[index] == "roleQualOption") { ref->roleQualOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "roleQual") {
		ref->roleQual = value;
		if (!ref->roleQual.empty() && ref->roleQual != "ALL" && ref->roleQual != "*") {
			split(ref->roleQual, '|', ref->roleQuals);

			for (auto& qual : ref->roleQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmPairingChartRoleQual", headers[index]); }
}

