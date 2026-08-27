/**
 * @file CalculatePostUlrRestAtBaseForSQRule.h
 * @brief Rule 7423 - SQ post-ULR minimum rest at base.
 */

#ifndef RULEENGINE_RULE7423_CALCULATEPOSTULRRESTATBASEFORSQRULE_H_
#define RULEENGINE_RULE7423_CALCULATEPOSTULRRESTATBASEFORSQRULE_H_

#include <vector>

#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"

#include "PostUlrRestAtBaseForSQRuleParam.h"

class CalculatePostUlrRestAtBaseForSQRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7423;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculatePostUlrRestAtBaseForSQRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, RuleFuncId, AvailableInterface) {
        ParseParam(input);
    }

    ~CalculatePostUlrRestAtBaseForSQRule() override = default;

    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
    struct RestWindowResult {
        int minRestAtBaseMinutes{0};
        time_t restStartLoc{0};
        time_t requiredEndLoc{0};
    };

    struct RuleInstance {
        long long ruleId{0};
        PostUlr7423ControlParam control{};
        std::vector<PostUlrRestAtBaseForSQRuleParam> params{};
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);
    static bool ParseControlRow(const DBRule& dbRule, PostUlr7423ControlParam& control);

    static time_t GetRestStartLocAfterDuty(const Duty& duty, const PostUlr7423ControlParam& control);
    static time_t CeilToNextMidnight(time_t tLoc, bool exactMidnightNextDay = false);
    static int ClampMinutesOfDay(int minutes);
    static int CalcDerivedAtdoDaysFromRestWindow(const RestWindowResult& restWindow,
                                                 const PostUlr7423ControlParam& control);

    bool PairingMatchesServiceTypeAndFleets(const Pairing& pairing, const PostUlr7423ControlParam& control) const;
    bool PairingHasUlrEndingAtCrewBase(const Pairing& pairing, Duty*& outLastUlrDuty, Duty*& outLastDutyAtBase) const;
    bool CalcMinRestAtBase(const Duty& lastDuty,
                           const PostUlrRestAtBaseForSQRuleParam& ruleParam,
                           const PostUlr7423ControlParam& control,
                           RestWindowResult& outRestWindow) const;
};

#endif  // RULEENGINE_RULE7423_CALCULATEPOSTULRRESTATBASEFORSQRULE_H_

