/**
 * @file RuleSystemDefine.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-17
**/


#ifndef NEWRULEENGINE_RULESYSTEMDEFINE_H
#define NEWRULEENGINE_RULESYSTEMDEFINE_H

#include "Segment.h"
#include "Duty.h"
#include "Pairing.h"
#include "CrewDB.h"

/*
 * Available interface to check rule
 * if new rule is added, name it properly, and set the value to be next bit move
 * e.g. SomeNewInterface = InitBit << 10;
 */
namespace RuleInterface{
    typedef uint64_t InterfaceUnderlyingType;
    constexpr InterfaceUnderlyingType InitBit = 1;
    enum Interface: InterfaceUnderlyingType {
        SingleSegment   = InitBit << 0,
        SingleDuty      = InitBit << 1,
        SinglePairing   = InitBit << 2,
        SingleCrew      = InitBit << 3,
        SingleRoster    = InitBit << 4,
        GroupedSegment  = InitBit << 5,
        GroupedDuty     = InitBit << 6,
        GroupedPairing  = InitBit << 7,
        GroupedCrew     = InitBit << 8,
        GroupedRoster   = InitBit << 9,
    };
    namespace InputType{
        using SingleSegmentInputType = const Segment*;
        using SingleDutyInputType = const Duty*;
        using SinglePairingInputType = const Pairing*;
        using SingleCrewRosterInputType = const std::vector<const ROSTER*>&;
        using SingleCrewInputType = const std::shared_ptr<CREW>&;
        
    }

    namespace CallInputPackCheck {
        /*
         * Below code is to enforce interface call at predefined parameter, avoiding wrongly called rule
         * NOTE: can do better with c++20 concept feature, use c++14 version for compatibility
         */
        template <Interface, class ...>
        constexpr bool Check = true;

		/*
        template <class... Args,
                class Enable = std::enable_if_t<std::conjunction<std::is_convertible<Args, InputType::SingleSegmentInputType>...>::value>>
        constexpr bool Check<Interface::SingleSegment, Enable, Args...> = true;

        template <class... Args,
                class Enable = std::enable_if_t<std::conjunction<std::is_convertible<Args, InputType::SingleDutyInputType>...>::value>>
        constexpr bool Check<Interface::SingleDuty, Enable, Args...> = true;

        template <class... Args,
                class Enable = std::enable_if_t<std::conjunction<std::is_convertible<Args, InputType::SinglePairingInputType>...>::value>>
        constexpr bool Check<Interface::SinglePairing, Enable, Args...> = true;

        template <class... Args,
                class Enable = std::enable_if_t<std::conjunction<std::is_convertible<Args, InputType::SingleCrewInputType>...>::value>>
        constexpr bool Check<Interface::SingleCrew, Enable, Args...> = true;
		*/
    }


    namespace InterfaceImplementationCheck {
        /*
         * Below code is to enforce correct implementation on interface indicated override functions (at least definition)
         */
        template<class Rule, class... Args>
        struct Helper{
            static auto FunctorCheck(Rule* rule) -> decltype(rule->CheckRule(std::declval<Args>()...), std::true_type{}) {
                //static_assert(false, "DirectCall to FunctorCheck is ill-formed");
            };
            // Fallback for when CheckRule with specific parameter doesn't exist
            static std::false_type FunctorCheck(...) {
                //static_assert(false, "DirectCall to FunctorCheck is ill-formed");
            };

            static constexpr bool value = decltype(FunctorCheck(std::declval<Rule*>()))::value;
        };


        template <InterfaceUnderlyingType, class Rule, class = void>
        constexpr bool Check = true;

        template <class Rule>
        constexpr bool Check<Interface::SingleSegment, Rule,
                             std::enable_if_t<Rule::AvailableInterface & Interface::SingleSegment>> = Helper<Rule, InputType::SingleSegmentInputType >::value;

        template <class Rule>
        constexpr bool Check<Interface::SingleDuty, Rule,
                             std::enable_if_t<Rule::AvailableInterface & Interface::SingleDuty>> = Helper<Rule, InputType::SingleDutyInputType>::value;

        template <class Rule>
        constexpr bool Check<Interface::SinglePairing, Rule,
                             std::enable_if_t<Rule::AvailableInterface & Interface::SinglePairing>> = Helper<Rule, InputType::SinglePairingInputType>::value;

        template <class Rule>
        constexpr bool Check<Interface::GroupedRoster, Rule,
            std::enable_if_t<Rule::AvailableInterface& Interface::GroupedRoster>> = Helper<Rule, InputType::SingleCrewRosterInputType>::value;

        template <class Rule>
        constexpr bool Check<Interface::SingleCrew, Rule,
                             std::enable_if_t<Rule::AvailableInterface & Interface::SingleCrew>> = Helper<Rule, InputType::SingleCrewInputType>::value;

        template <class Rule>
        constexpr bool CheckAll() {
            static_assert(Check<RuleInterface::Interface::SingleSegment, Rule>, "SingleSegment interface enabled but not implemented");
            static_assert(Check<RuleInterface::Interface::SingleDuty, Rule>, "SingleDuty interface enabled but not implemented");
            static_assert(Check<RuleInterface::Interface::SinglePairing, Rule>, "SinglePairing interface enabled but not implemented");
            static_assert(Check<RuleInterface::Interface::GroupedRoster, Rule>, "GroupedRoster interface enabled but not implemented");
            static_assert(Check<RuleInterface::Interface::SingleCrew, Rule>, "SingleCrew interface enabled but not implemented");
            return true;
        }
    }
}

namespace InputRuleParamDefine{
    constexpr char WildcardChar = '*';
    constexpr char BoolYes = 'Y';
    constexpr char BoolNo = 'N';
}

/*
 * c++ style enum <-> underlying type helper
 */
template <class EnumType>
constexpr std::enable_if_t<std::is_enum<EnumType>::value, std::underlying_type_t<EnumType>> enum_to_underlying(EnumType enumValue) noexcept {
	return static_cast<std::underlying_type_t<EnumType>>(enumValue);
}
template <class EnumType, class UnderlyingType>
std::enable_if_t<std::is_enum<EnumType>::value && std::is_convertible<UnderlyingType, std::underlying_type_t<EnumType>>::value, EnumType> underlying_to_enum(const UnderlyingType& underlyingValue) noexcept {
	return static_cast<EnumType>(underlyingValue);
}


#endif //NEWRULEENGINE_RULESYSTEMDEFINE_H
