/**
 * @file CalculateMaxDPByComplementForPRRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMaxDPByComplementForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

void CalculateMaxDPByComplementForPRRule::CalculateDuty(Duty* duty) {
	const auto& dutyComposition = GetDutyComposition(duty);
	for (const auto& ruleParam : _ruleParams) {
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (!CalculateDuty(duty, ruleParam, dutyComposition)) {
			break;
		}
	}
}

void CalculateMaxDPByComplementForPRRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMaxDPByComplementForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

bool CalculateMaxDPByComplementForPRRule::CalculateDuty(Duty* duty, const CalculateMaxDPByComplementForPRRuleParam& ruleParam, const int dutyComposition) {
	if (this->_application == PAIRING_OPTIMIZER && !ruleParam._refComposition.empty() && ruleParam._refComposition != "" && ruleParam._refComposition != "*")
		return true;
	bool next = true;

	const auto& minComposition = GetMinComposition(ruleParam);

	if (ruleParam.MatchRule(duty, minComposition, dutyComposition)) {

		duty->setMaxDutyMin(ruleParam._maxDP);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, ruleParam._maxDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());

		next = false;
	}
	return next;
}

void CalculateMaxDPByComplementForPRRule::CalculateDuty(vector<Duty*> duties) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
	for (Duty* duty : duties) {
		const auto& dutyComposition = GetDutyComposition(duty);
		for (const auto& ruleParam : _ruleParams) {
			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			if (!CalculateDuty(duty, ruleParam, dutyComposition)) {
				break;
			}
		}
	}
}



void CalculateMaxDPByComplementForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMaxDPByComplementForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}


int CalculateMaxDPByComplementForPRRule::GetMinComposition(const CalculateMaxDPByComplementForPRRuleParam& ruleParam) {
	
	if (ruleParam._refComposition.empty() || ruleParam._refComposition == "" || ruleParam._refComposition == "*")
		return 0;
	int minComposition = 0;

	for (auto& composition : this->_dbData->compositionList) {
		if (composition.getName() == ruleParam._refComposition) {
			if (this->_dbData->compositionRankOptionMap.find(composition.getCompositionId()) == this->_dbData->compositionRankOptionMap.end())
				continue;
			const auto& optionRanks = this->_dbData->compositionRankOptionMap[composition.getCompositionId()];
			const auto optionIter = optionRanks.begin();

			int k = -1;
			for (k = 0; k < optionIter->second.rankCount; k++) {
				string rank = optionIter->second.rankValue[k].rank;
				if (rank == "") {
					continue;
				}
				if ((this->_dbData->rankMap[rank].division == this->_dbData->scenario.division) && this->_dbData->rankMap[rank].isMustCrewRank)
					minComposition += optionIter->second.rankValue[k].plan_value;
			}
			break;
		}
	}
	return minComposition;
}

int CalculateMaxDPByComplementForPRRule::GetDutyComposition(const Duty* duty) {
	int composition = 999999;

	for (const auto& segment : duty->getSegmentsRead()) {
		if (!segment->getIsOperating())
			continue;
		int segmentComposition = 0;
		if (this->_dbData->flightIdToPairing.find(segment->getDBId()) == this->_dbData->flightIdToPairing.end())
			return 0;

		for (std::size_t j = 0; j < this->_dbData->flightIdToPairing[segment->getDBId()].size(); j++) {
			long long id = this->_dbData->flightIdToPairing[segment->getDBId()][j];
			map<string, int>::iterator iter;
			if (this->_dbData->pairingIdMap.find(id) != this->_dbData->pairingIdMap.end()) {
				iter = this->_dbData->pairingIdMap[id]->getComplements().begin();
				while (iter != this->_dbData->pairingIdMap[id]->getComplements().end()) {
					if (this->_dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
						iter++;
						continue;
					}
					if ((this->_dbData->rankMap[iter->first].division == this->_dbData->scenario.division) && this->_dbData->rankMap[iter->first].isMustCrewRank) {
						segmentComposition += iter->second;
					}
					iter++;
				}
			}
		}
		composition = min(composition, segmentComposition);
	}
	return composition;
}