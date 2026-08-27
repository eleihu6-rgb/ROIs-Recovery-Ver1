/**
 * @file CalculateReducedRestForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/

#include "../RuleSytem.h"
#include "CalculateReducedRestForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../../db/Pairing.h"


// ============================================================
// CalculateDuty(rosters) - Crew维度的计算入口（已有逻辑，未修改）
// ============================================================
// 调用路径：checkRulesImpl → setMinRestReduce_TG(rosters) → 此方法
//
// 流程：
//   1. 从crew获取primeBase作为基地匹配依据
//   2. 从rosters中提取所有duties
//   3. 清除该法规之前设置的DutyDelta（避免重复计算）
//   4. 调用内部方法 CalculateDuty(duties, base)
//
// 适用场景：Duty已分配给Crew，在checkRulesImpl中被调用
// ============================================================
void CalculateReducedRestForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	if (duties.empty())
		return;
	for (auto& duty : duties) {
		std::lock_guard <std::mutex> lockGuard(_7022mutex);
		duty->getDutyDelta().remove(CalculateReducedRestForTGRule::RuleFuncId);
	}
	CalculateDuty(duties, base);
}

// ============================================================
// CalculateDuty(Pairing*) - Pairing维度的计算入口（新增逻辑）
// ============================================================
// 调用路径：calculatePairingFdpRest → setMinRestReduce_TG → 此方法
//
// 目的：
//   处理尚未分配给任何Crew的Duty。当Duty存在于Pairing中但没有对应
//   Roster/Crew时，Crew维度的CalculateDuty(rosters)不会被调用，
//   导致manualRestDiscretion未被设置。
//
// 此方法仅调用SetManualRestDiscretion，不处理DutyDelta/nextDuty逻辑。
//
// 幂等性保证：
//   如果Duty后续被分配给Crew，Crew维度会再次调用CalculateDuty，
//   使用相同的公式重新计算manualRestDiscretion，结果一致。
// ============================================================
void CalculateReducedRestForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty() || pairing == nullptr) {
		return;
	}

	// 使用Pairing的base作为基地匹配依据
	// 当base为空时，MatchHomeBase内部会通过duty.getPairingId()查找Pairing获取base
	string base = pairing->getBase();

	// 从Pairing中获取所有Duties
	vector<Duty*> duties = pairing->getDutyVec();
	if (duties.empty())
		return;

	// 仅设置manualRestDiscretion，不处理DutyDelta/nextDuty
	SetManualRestDiscretion(duties, base);
}

// ============================================================
// SetManualRestDiscretion - 仅设置manualRestDiscretion（核心方法）
// ============================================================
// 遍历所有duties，对标记了REST discretion的duty计算并设置：
//   manualRestDiscretion = duty.getMinRest() - ruleParam._restMin
//
// 处理所有Duty（包括最后一个），因为此计算不需要nextDuty。
//
// 此方法被两个入口共用：
//   1. CalculateDuty(Pairing*) - 仅调用此方法（Pairing维度）
//   2. CalculateDuty(duties, base) - 调用此方法 + Pass 2 DutyDelta逻辑（Crew维度）
//
// 前置条件：
//   - duty->getDiscretionTypes() 包含 "REST"（从DB加载或手动设置）
//   - ruleParam.MatchHomeBase(*duty, base) 返回 true
//   - duty->getMinRest() > ruleParam._restMin
// ============================================================
void CalculateReducedRestForTGRule::SetManualRestDiscretion(vector<Duty*> duties, const string& base) {
	for (size_t i = 0; i < duties.size(); i++) {
		auto duty = duties[i];
		const auto& discretionTypes = duty->getDiscretionTypes();
		// 检查该Duty是否标记了REST discretion
		if (discretionTypes.empty() || discretionTypes[0].empty() || find(discretionTypes.begin(), discretionTypes.end(), "REST") == discretionTypes.end()) {
			continue;
		}
		for (const auto& ruleParam : _ruleParams) {
			// 基地匹配 且 minRest大于阈值时，计算manualRestDiscretion
			if (ruleParam.MatchHomeBase(*duty, base) && duty->getMinRest() > ruleParam._restMin) {
				std::lock_guard<std::mutex> lockGuard(_7022mutex);
				int manualRestDiscretion = duty->getMinRest() - ruleParam._restMin;
				duty->setManualRestDiscretion(manualRestDiscretion);
			}
		}
	}
}

// ============================================================
// CalculateDuty(duties, base) - Crew维度内部核心计算方法
// ============================================================
// 仅被CalculateDuty(rosters)调用（Crew维度入口）。
//
// 计算逻辑分两步：
//   Step 1: 调用SetManualRestDiscretion设置manualRestDiscretion
//   Step 2: 处理DutyDelta和nextDuty调整（需要nextDuty，排除最后一个）
//
// 注意：Pairing维度入口（CalculateDuty(Pairing*)）不调用此方法，
//       而是直接调用SetManualRestDiscretion，因为Pairing维度不需要
//       DutyDelta/nextDuty逻辑。
// ============================================================
void CalculateReducedRestForTGRule::CalculateDuty(vector<Duty*> duties, const string& base) {
	auto accumulateRestDiscretion = [](Duty* targetDuty, int deltaMinutes) {

		targetDuty->getDutyDelta().addRestDiscretion(CalculateReducedRestForTGRule::RuleFuncId, deltaMinutes);

		if (!targetDuty->supportDiscretionType(DiscretionType::REST)) {
			vector<string> discretionTypes = targetDuty->getDiscretionTypes();
			discretionTypes.push_back(DiscretionType::REST);
			targetDuty->setDiscretionTypes(discretionTypes);
			targetDuty->setOriginDiscretionType(joinStrList(discretionTypes, ","));
		}
	};

	// ============================================================
	// Step 2: Process rest reduction logic that requires nextDuty
	// ============================================================
	// This pass handles the accumulateRestDiscretion logic and
	// nextDuty modifications (FDP discretion, minRest adjustment).
	// Note: Loop excludes last duty since it needs nextDuty.
	// ============================================================
	for (size_t i = 0; i < duties.size() - 1; i++) {
		auto duty = duties[i];
		const auto& discretionTypes = duty->getDiscretionTypes();
		if (discretionTypes.empty() || discretionTypes[0].empty() || find(discretionTypes.begin(), discretionTypes.end(), "REST") == discretionTypes.end()) {
			continue;
		}
		auto nextDuty = duties[i + 1];
		for (const auto& ruleParam : _ruleParams) {
			if (ruleParam.MatchHomeBase(*duty, base) && duty->getMinRest() > ruleParam._restMin) {
				int actRest = (nextDuty->getFirstPickup()->getStartTimeUtcAct() - duty->getLastDropoff()->getEndTimeUtcAct()) / 60;
				const auto& reduceMin = duty->getMinRest() - actRest;

				if (ruleParam._restMin > 0 && reduceMin > 0 && ruleParam._restMin < actRest) {
					// Preserve any recovery-rest adjustment carried from the previous duty,
					// then apply the current duty's own reduced-rest delta.
					{
						std::lock_guard <std::mutex> lockGuard(_7022mutex);
						accumulateRestDiscretion(duty, reduceMin);
					}
					
					if (ruleParam._isReduceNextDutyMaxFDP) {
						{
							std::lock_guard <std::mutex> lockGuard(_7022mutex);
							nextDuty->getDutyDelta().addFDPDiscretion(CalculateReducedRestForTGRule::RuleFuncId, -1 * reduceMin);
						}

						if (!nextDuty->supportDiscretionType(DiscretionType::FDP)) {
							vector<string> discretionTypes = nextDuty->getDiscretionTypes();
							discretionTypes.push_back(DiscretionType::FDP);
							nextDuty->setDiscretionTypes(discretionTypes);
							nextDuty->setOriginDiscretionType(joinStrList(discretionTypes, ","));
						}

					}
					if (ruleParam._isAddNextDutyMinRest) {
						// Recovery rest is stored as a negative value because
						// CheckGeneralRule applies: minRest -= manualRestDiscretion.
						{
							//std::lock_guard <std::mutex> lockGuard(_7022mutex);
							//accumulateRestDiscretion(nextDuty, -1 * reduceMin);
							{
								std::lock_guard <std::mutex> lockGuard(_7022mutex);
								nextDuty->getDutyDelta().addMinRestMinutes(CalculateReducedRestForTGRule::RuleFuncId, reduceMin);
							}
							int minRest = nextDuty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
							int newMinRest = minRest + reduceMin;//前一个Duty减少min rest，需要加到下一个Duty上
							nextDuty->setMinRest(newMinRest, true);
							nextDuty->setMinRestAtBase(newMinRest, true);
							nextDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, newMinRest, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);

						}

					}
				}
				
			}
		}
	}
}


void CalculateReducedRestForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateReducedRestForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
