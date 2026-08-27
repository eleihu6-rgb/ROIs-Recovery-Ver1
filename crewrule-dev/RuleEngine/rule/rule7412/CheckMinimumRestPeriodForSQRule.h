
#ifndef CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULE_H
#define CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULE_H

#include <string>
#include <utility>
#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "../period/WorkPeriod.h"
#include "CheckMinimumRestPeriodForSQRuleParam.h"

class CheckMinimumRestPeriodForSQRule:public BasicRule{
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::CHECK_MINIMUM_REST_PERIOD_FOR_SQ;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckMinimumRestPeriodForSQRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckMinimumRestPeriodForSQRule::RuleFuncId, CheckMinimumRestPeriodForSQRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CheckMinimumRestPeriodForSQRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

    bool CheckRule(const Pairing* pairing) const override;

    bool CheckRule(const Duty* duty) const override;

    // check rest between consecutive duties in a duty list
    bool CheckRule(const std::vector<Duty*>& duties) const;

private:
    struct RuleInstance {
        long long ruleId{0};
        MinRest7412ControlParam control{};
        std::vector<CheckMinimumRestPeriodForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);
    static void ParseControlRow(const DBRule& dbRule, MinRest7412ControlParam& control);
    bool MatchesControl(const Duty* currDuty, const Duty* nextDuty, const MinRest7412ControlParam& control) const;


	// return <是否符合规则, 不违规的最小休息分钟数>
    pair<bool, int> CheckRule(const Duty *currDuty, const Duty* nextDuty, const CheckMinimumRestPeriodForSQRuleParam& ruleParam
        , time_t restStartUtc, int restMinutes, int offsetMinutes, const std::string& restZoneId, int numLocalNights) const;

    bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const;

     void ThrowRuleViolationMinRest(const Duty *duty,
                                    const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const;
     void ThrowRuleViolationMinLocalNights(const Duty *duty,
                                           const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const;
     void ThrowRuleViolationMinRestAndLocalNights(const Duty *duty,
                                                  const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const;
 
 };
 
 #endif //CREWRULE_CHECKMINIMUMRESTPERIODFORSQRULE_H
