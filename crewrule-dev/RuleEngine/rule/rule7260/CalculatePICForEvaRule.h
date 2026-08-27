/**
 * @file CalculatePICForEvaRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/



#ifndef _CALCULATEPICFOREVARULE_H_
#define _CALCULATEPICFOREVARULE_H_

#include <string>
#include <tuple>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculatePICForEvaRuleParam.h"

// 辅助结构体：存储Duty的基础信息
struct DutyContext {
    int dutyIndex;          // Duty索引
    int totalDuties;        // 总Duty数
    std::string firstPIC;   // 当前Duty的首个PIC
};

class CalculatePICForEvaRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7260;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedPairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculatePICForEvaRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculatePICForEvaRule::RuleFuncId, CalculatePICForEvaRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculatePICForEvaRule() override = default;

    void Calculate(const Pairing* pairing) const;

    void Calculate(std::vector<const ROSTER*>& rosters) const;

    void CalculateNormalFlight(const Pairing* pairing) const;

    void CalculateTrainingFlight(const Pairing* roster) const;

private:

    bool CompareCrew(SharedPtr<CREW> crewA, SharedPtr<CREW> crewB) const;

    std::unordered_map<long long, std::string> GetExistingFlightPICMap(const Pairing* pairing) const;

    std::vector<std::string> CalculateDutyPICSequence(const DutyContext& dutyCtx, const std::vector<long long>& segmentIds, const std::unordered_map<long long, std::vector<SharedPtr<CREW>>>& segFCNCrewsMap) const;

    std::vector<SharedPtr<CREW>> GetFCNCrewsFromCrewOnFlight(const long long pairingId, const long long segmentId) const;

    void ParseParam(const InputType& input);
};


#endif //_CALCULATEPICFOREVARULE_H_
