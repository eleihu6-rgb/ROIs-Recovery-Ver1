#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"

/*
   Pier Solution Limited. 2022/6/12
   EASA 法规 7025
   ORO.FTL.105 Definitions   "Acclimatised"
   依赖LOCAL_NIGHT_DEFINITION法规的本地夜晚定义：法规ID为2014
*/

/*
struct AcclimatisedStatesByLN
{
	double tzDiffFrom;
	double tzDiffTo;
	int etrtz_from;
	int etrtz_to;
	int minLN;
};
*/

void LegalityChecker::setAcclimationStateByLocalNights(vector<Duty *> duties)
{

	auto& rules = this->_dbData->getRuleFunctions(RULES::EASA_ACCLIMATISATION_LOCAL_NIGHTS);
	auto& localNightRules = this->_dbData->getRuleFunctions(RULES::LOCAL_NIGHT_DEFINITION);

	if (rules.size() == 0 || localNightRules.size() ==0)
		return;

	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	
	//EASA Definitions
	//local_night.LocalStart = "22:00";
	//local_night.LocalEnd = "08:00";
	//local_night.MinRestInterval = "08:00";

	/*
	if (local_night)
	{
		printf("");
		return;
	}
	*/

	//vector<AcclimatisedStatesByLN *> statesDef;
	//Ref Tz Start,Ref Tz End,ETRTZ Start,ETRTZ End,Min LN
	for (auto singleRule : rules)
	{
		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string tzDiffFrom = "0", tzDiffTo = "24", etrtz_lower = "00:00", etrtz_upper = "9999:59", minLN = "0";
		string strDefinition, strValue;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "REF TZ START") {
				tzDiffFrom = headeValue;
			}
			if (header == "REF TZ END") {
				tzDiffTo = headeValue;
			}
			if (header == "ETRTZ START") {
				etrtz_lower = headeValue;
			}
			if (header == "ETRTZ END") {
				etrtz_upper = headeValue;
			}
			if (header == "MIN LN") {
				minLN = headeValue;
			}
		}
		//ETRTZ, TimeZone diff是分钟
		int iETRTZ_From = stoi(etrtz_lower.substr(0, etrtz_lower.find(":"))) * 60 + stoi(etrtz_lower.substr(etrtz_lower.find(":") + 1));
		int iETRTZ_To = stoi(etrtz_upper.substr(0, etrtz_upper.find(":"))) * 60 + stoi(etrtz_upper.substr(etrtz_upper.find(":") + 1));

		int fTZDiff_From = static_cast<int>(atof(tzDiffFrom.c_str()) * 60);
		int fTZDiff_To = static_cast<int>(atof(tzDiffTo.c_str()) * 60);
		int iMinLN = atoi(minLN.c_str());

		if (duties.size() <= 1)
			continue;

		for (int i = 1; i < (int)duties.size(); i++)
		{
			/*
			long long pgId = duties[0]->getPairingId();
			if ((pgId == 1) || (pgId == 2) || (pgId == 12231104) || (pgId == 12231108))
			{
				for (auto duty : duties)
				{
					int etrtz = duty->getETRTZ();
					int tz = duty->getRefTimeZone();
					string state = duty->getAcclimatisedState();
					int lastAcc = duty->getLastAcclimatisedDutyIndex();
					printf(state.c_str());
				}
			}

			if ((pgId == 12231104) && i == 3)
				printf("ok");
			if ((pgId == 12231108) && i == 1)
				printf("ok");
			*/

			if (duties[i]->getAcclimatisedState() == "D")
				continue;
			if (duties[i]->getTzDiffs() > fTZDiff_To || duties[i]->getTzDiffs() < fTZDiff_From)
				continue;
			if (duties[i]->getETRTZ() > iETRTZ_To || duties[i]->getETRTZ() < iETRTZ_From)
				continue;

			string dep = duties[i]->getDepartureStation();
			auto offsetDepMinutes = this->_dbData->getAirportOffsetMinutes(dep);

			time_t restStart, restEnd;
			restStart = duties[i-1]->getEndTimeUtcAct();
			restEnd = duties[i]->getStartTimeUtcAct();
			long pickup = duties[ i ]->getActualPickupMin();
			long dropoff = duties[ i-1]->getActualDropoffMin();
			if (pickup <= 0)
				pickup = duties[ i ]->getMinPickup();
			if (dropoff <= 0)
				dropoff = duties[ i - 1]->getMinDropoff();
			restStart += dropoff * 60;
			restEnd -= pickup * 60;
			int offsetMinutes = duties[i]->getRefTimeZone();
			int numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(restStart, restEnd, 6, local_night, offsetDepMinutes);

			if (numberOfLocalNighs >= iMinLN)
			{
				duties[i]->setETRTZ(-1);
				duties[i]->setLastAcclimatisedDutyIndex(i);
				duties[i]->setTzDiffs(-1);
				duties[i]->setAcclimatisedState("D");
				duties[i]->setRefTimeZone(offsetDepMinutes);
			}

		}
	}
}