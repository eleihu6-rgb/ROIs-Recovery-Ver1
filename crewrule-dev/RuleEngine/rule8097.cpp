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

using namespace std;

//依赖于3013的composition定义,必须在其他MAX FDP法规之后调用
bool LegalityChecker::setMaxFDPByExtension(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool isValid = true;

	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::MAX_FDP_EXTENSION);
	if (rules.size() == 0 || duties.size() == 0)
		return true;
	string composition = this->getCompositionByRanks(duties[0]);
	string base = duties[0]->getDepartureStation();	

	map<string, string>::const_iterator iter;
	string header, headeValue;
	//LQ5.3.1
	for (auto& rule : rules)
	{
		auto& parameter = rule.params;

		string pComposition, pFdpExtension;
		string pStartTransit, pEndTransit;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "COMPOSITION")					pComposition = headeValue;
			if (header == "TRANSIT TIME START")				pStartTransit = headeValue;
			if (header == "TRANSIT TIME END")				pEndTransit = headeValue;
			if (header == "FDP EXTENSION")					pFdpExtension = headeValue;
		}
		if (composition != pComposition)
			continue;


		int transit_start = hhmmStrToMinutes(pStartTransit);
		int transit_end =	hhmmStrToMinutes(pEndTransit);
		int fdpExtension = hhmmStrToMinutes(pFdpExtension);

		for (std::size_t i = 0; i < duties.size(); ++i)
		{
			if (duties[i]->getNumSegments() <= 1)
				continue;
			composition = this->getCompositionByRanks(duties[i]);

			if (pComposition != "*" && pComposition != composition)
				continue;
			int max_fdp = duties[i]->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			if (max_fdp <= 0)
				continue;
			
			for (int j = 0; j < (int)duties[i]->getNumSegments() - 1; j++)
			{
				int transit = static_cast<int>(duties[i]->getSegment(j + 1)->getStartTimeUtcAct() - duties[i]->getSegment(j)->getEndTimeUtcAct()) / 60;
				if (transit >= transit_start && transit <= transit_end)
				{
					duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, max_fdp + fdpExtension, rule.idRule, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference);//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
					//不考虑sement有多个满足条件情形，extension不能被反复叠加
					break;
				}
			}
			
		}
	}

	return isValid;
}