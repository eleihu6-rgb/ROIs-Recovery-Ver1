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
#include "TimezoneUtils.h"

using namespace std;

//依赖于3013的composition定义
bool LegalityChecker::setMaxFDPByTimes(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool isValid = true;

	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::LQ_MAX_FDP);
	if (rules.size() == 0 || duties.size()==0)
		return true;
	string composition = this->getCompositionByRanks(duties[0]);
	string base = duties[0]->getDepartureStation();
	//vector<RULE_COMPOSITION>* compositons = this->getCompositionDefinition();

	map<string, string>::const_iterator iter;
	string header, headeValue;
	//LQ5.1.4
	map<int,int> numberOfSegments;
	//TABLE NUM =1
	for (auto& rule : rules)
	{
		if (rule.tableNum != 1)
			continue;
		auto& parameter = rule.params;
		string pComposition,pBlockStart,pBlockEnd,pCountSector;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "COMPOSITION")					pComposition = headeValue;
			if (header == "BLOCK TIME FROM")				pBlockStart = headeValue;
			if (header == "BLOCK TIME TO")					pBlockEnd = headeValue;
			if (header == "COUNT AS SECTOR")				pCountSector = headeValue;
		}

		if (composition != pComposition)
			continue;
		int block_start = hhmmStrToMinutes(pBlockStart);
		int block_end = hhmmStrToMinutes(pBlockEnd);
		int countSector = atoi(pCountSector.c_str());

		for (int i = 0; i < (int)duties.size(); ++i)
		{
			int countOfSegment = (int)duties[i]->getNumSegments();
			map<int, int>::iterator find = numberOfSegments.find(i);
			if (find != numberOfSegments.end())
				countOfSegment = find->second;

			for (std::size_t j = 0; j < duties[i]->getNumSegments(); j++)
			{
				Segment* segment = duties[i]->getSegment(j);
				int block=segment->getBlkMinutes();
				if (block <= block_end && block >= block_start)
				{
					countOfSegment += (countSector - 1);
				}
			}
			if (find != numberOfSegments.end())
			{
				find->second = countOfSegment;
			}
			else
			{
				numberOfSegments.insert(make_pair(i, countOfSegment));
			}

		}
	}

	//TABLE NUM=2
	for (auto& rule : rules)
	{
		if (rule.tableNum != 2)
			continue;

		auto& parameter = rule.params;

		string pComposition, pLocalStart, pSectors, pTimezone, pMaxFdp, pLocalEnd;
		//string pStartTransit, pEndTransit,pStartBlock, pEndBlock;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION")					pComposition = headeValue;
			if (header == "NO. OF SECTORS")					pSectors = headeValue;
			if (header == "DP START LOCAL TIME")			pLocalStart = headeValue;
			if (header == "DP END LOCAL TIME")				pLocalEnd = headeValue;
			//if (header == "TRANSIT TIME START")			pStartTransit = headeValue;
			//if (header == "TRANSIT TIME END")				pEndTransit = headeValue;
			//if (header == "BLOCK TIME START")				pStartBlock = headeValue;
			//if (header == "BLOCK TIME END")				pEndBlock = headeValue;
			if (header == "TIMEZONE DIFF WITH BASE")		pTimezone = headeValue;
			if (header == "MAX FDP")						pMaxFdp = headeValue;		
		}
		if (composition != pComposition)
			continue;

		int iSegments = 0,iTimezoneDiff=0;
		if (pSectors!="*")
			iSegments=atoi(pSectors.c_str());
		if (pTimezone != "*")
			iTimezoneDiff = atoi(pTimezone.c_str());

		//int transit_start = hhmmStrToMinutes(pStartTransit);
		//int transit_end =	hhmmStrToMinutes(pEndTransit);
		//int block_start = hhmmStrToMinutes(pStartBlock);
		//int block_end = hhmmStrToMinutes(pEndBlock);
		int duty_start = hhmmStrToMinutes(pLocalStart);
		int duty_end = hhmmStrToMinutes(pLocalEnd);
		int maxFdp = hhmmStrToMinutes(pMaxFdp);

		for (int i = 0; i < (int)duties.size(); ++i)
		{
			composition = this->getCompositionByRanks(duties[i]);

			if (pComposition != "*" && pComposition != composition)
				continue;

			if (pSectors != "*")
			{
				int countOfSegment = (int)duties[i]->getNumSegments();
				map<int, int>::iterator find = numberOfSegments.find(i);
				if (find != numberOfSegments.end())
					countOfSegment = find->second;
				if (iSegments != countOfSegment)
					continue;
			}

			time_t start = duties[i]->getStartTimeUtcAct();
			auto offset_dep_Minutes = this->_dbData->getAirportOffsetMinutes(duties[i]->getDepStation());
			auto offset_arr_Minutes = this->_dbData->getAirportOffsetMinutes(duties[i]->getArrStation());

			if (pTimezone != "*")
			{
				if (TimezoneUtils::abs(offset_arr_Minutes - offset_dep_Minutes)/60.0 > iTimezoneDiff)
					continue;
			}
			
			if (!Utility::GetInstancePtr()->isTimeCoveredInRange(start, offset_dep_Minutes, duty_start, duty_end))
				continue;

			duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdp, rule.idRule, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference);//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
		}		
	}

	return isValid;
}

