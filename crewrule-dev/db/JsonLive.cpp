#include <stdio.h>
#include <vector>
#include <algorithm>

#include <memory>
#include <iostream>
#include <time.h>
#include "CrewDB.h"
#include "UtilFunc.h"

#include "JsonParser/JsonParser.h"

using namespace std;

void parseJson_Live(Value &doc, Scenario * ref) {

	if (doc.HasMember("strDtLoc")) {
		const char* strat = doc["strDtLoc"].GetString();
		char* tmp = new char[100];//足够长
		strcpy(tmp, strat);
		ref->startDtUTC = (localToUtc(utcStrToUtc(tmp)));
	}
	if (doc.HasMember("endDtLoc")) {
		const char* end = doc["endDtLoc"].GetString();
		char * tmp = new char[100];
		strcpy(tmp, end);
		ref->endDtUTC = (localToUtc(utcStrToUtc(tmp)));
	}
	if (doc.HasMember("ranks")) {
		ref->ranks.clear();
		Value &ranks = doc["ranks"];
		for (SizeType j = 0; j < ranks.Size(); j++) {
			string rank = ranks[j].GetString();
			ref->ranks.push_back(rank);
		}
	}
	if (doc.HasMember("fleets")) {
		ref->fleets.clear();
		Value &fleets = doc["fleets"];
		for (SizeType j = 0; j < fleets.Size(); j++) {
			string feet = fleets[j].GetString();
			ref->fleets.push_back(feet);
		}
	}	
	if (doc.HasMember("crewBases")) {
		ref->crewBases.clear();
		Value &crewBases = doc["crewBases"];
		for (SizeType j = 0; j < crewBases.Size(); j++) {
			string crewBase = crewBases[j].GetString();
			ref->crewBases.push_back(crewBase);
		}
	}	
	if (doc.HasMember("pairingBases")) {
		ref->bases.clear();
		Value &pairingBases = doc["pairingBases"];
		for (SizeType j = 0; j < pairingBases.Size(); j++) {
			string pairingBase = pairingBases[j].GetString();
			ref->bases.push_back(pairingBase);
		}
	}	
	if (doc.HasMember("divisionConstruction")) {
		ref->divisionConstruction.clear();
		Value &divisionConstruction = doc["divisionConstruction"];
		for (SizeType j = 0; j < divisionConstruction.Size(); j++) {
			string division = divisionConstruction[j].GetString();
			ref->divisionConstruction.push_back(division);
		}
	}
}