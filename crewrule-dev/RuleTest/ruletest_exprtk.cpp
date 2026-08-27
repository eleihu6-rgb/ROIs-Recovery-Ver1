#ifdef ENABLE_EXPRTK

#include <iostream>
#include <string>

#include "exprtk/exprtk.hpp"

struct CreditCalcRule {
	std::string assignmentGroups{};
	std::string assignments{};
	std::unique_ptr<bool> isChiefPilotCredit{nullptr};
	std::string courseCode{};
	std::string trainRole{};
	std::unique_ptr<bool> isIPOrCK{nullptr};
	std::unique_ptr<bool> isChiefPilot{nullptr};
	std::string credit;
	float multiple{ 1.0 };
};

struct CreditCalcRuleVariable {
	std::vector<std::string> assignmentGroups{};
	double std{};
	double sta{};

};

template <typename T>
T calcCredit(std::string strExpression, T& sta, T& std)
{
	exprtk::symbol_table<T> symbol_table;
	symbol_table.add_variable("STA", sta, true);
	symbol_table.add_variable("STD", std, true);

	exprtk::expression<T> expression;
	expression.register_symbol_table(symbol_table);

	exprtk::parser<T> parser;
	parser.compile(strExpression, expression);

	if (!parser.compile(strExpression, expression))
	{
		printf("[calcCredit] - Parser Error: %s\tExpression: %s\n",
			parser.error().c_str(),
			strExpression.c_str());
		return -1;
	}

	return expression.value();
}

template <typename T>
bool loadCreditExpression(exprtk::symbol_table<T>& symbol_table, exprtk::expression<T>& expression, CreditCalcRuleVariable& ruleVariable, const std::string strExpression) {
	expression.register_symbol_table(symbol_table);

	exprtk::parser<T> parser;
	parser.compile(strExpression, expression);

	if (!parser.compile(strExpression, expression))
	{
		printf("[loadCreditExpression] - Parser Error: %s\tExpression: %s\n",
			parser.error().c_str(),
			strExpression.c_str());
		return false;
	}

	return expression;
}

template <typename T>
bool loadExpression(exprtk::symbol_table<T>& symbol_table, exprtk::expression<T>& expression, const std::string strExpression) {
	expression.register_symbol_table(symbol_table);

	exprtk::parser<T> parser;
	parser.compile(strExpression, expression);

	if (!parser.compile(strExpression, expression))
	{
		printf("[loadExpression] - Parser Error: %s\tExpression: %s\n",
			parser.error().c_str(),
			strExpression.c_str());
		return false;
	}

	return expression;
}

namespace groups_impl
{

	template <typename T>
	struct groups_collection
	{
		bool add_group(const std::string& group_name, const std::set<T>& set)
		{
			const auto itr = groups.find(group_name);

			if (itr != groups.end())
			{
				return false;
			}

			groups[group_name] = set;
			return true;
		}

		bool contains(const std::string& group_name) const
		{
			return groups.count(group_name) > 0;
		}

		using set_t = std::set<T>;
		using ptr_t = set_t*;

		ptr_t get(const std::string group_name)
		{
			auto itr = groups.find(group_name);
			if (itr == groups.end())
			{
				return nullptr;
			}
			return &(itr->second);
		}

		std::map<std::string, std::set<T>> groups;
	};

	template <typename T>
	class create final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using string_t = typename generic_type::string_view;

		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		create(groups_collection<std::string>& groups)
			: exprtk::igeneric_function<T>("S")
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (parameter_list_t parameters) override
		{
			const std::string group_name = to_str(string_t(parameters[0]));

			if (
				!groups_.contains(group_name) &&
				!groups_.add_group(group_name, {})
				)
			{
				return T(0);
			}

			auto ptr = groups_.get(group_name);
			const std::size_t ptr_size = sizeof(ptr);
			T result = T(0);

			std::memcpy(reinterpret_cast<char*>(&result),
				reinterpret_cast<char*>(&ptr),
				ptr_size);

			return result;
		}

		strgrps_cllctn groups_;
	};

	template <typename SetType, typename T>
	SetType* make_set_handle(T v)
	{
		const std::size_t ptr_size = sizeof(SetType*);
		SetType* ptr = reinterpret_cast<SetType*>(0);

		std::memcpy(reinterpret_cast<exprtk::details::char_ptr>(&ptr),
			reinterpret_cast<exprtk::details::char_ptr>(&v),
			ptr_size);

		return ptr;
	}

	template <typename T>
	class add final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using scalar_t = typename generic_type::scalar_view;
		using string_t = typename generic_type::string_view;
		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		add(groups_collection<std::string>& groups)
			: exprtk::igeneric_function<T>("TS*")
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (parameter_list_t parameters) override
		{
			auto ptr = scalar_t(parameters[0])();
			assert(ptr != T(0));
			auto& set = *make_set_handle<strgrps_cllctn::set_t>(ptr);
			return process(set, parameters);
		}

	private:

		inline T process(strgrps_cllctn::set_t& set, const parameter_list_t& parameters)
		{
			for (std::size_t i = 1; i < parameters.size(); ++i)
			{
				set.insert(to_str(string_t(parameters[i])));
			}

			return T(1);
		}

		strgrps_cllctn groups_;
	};

	template <typename T>
	class contains final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using scalar_t = typename generic_type::scalar_view;
		using string_t = typename generic_type::string_view;
		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		contains(groups_collection<std::string>& groups)
			: exprtk::igeneric_function<T>("TS*")
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (parameter_list_t parameters) override
		{
			auto ptr = scalar_t(parameters[0])();
			assert(ptr != T(0));
			const auto& set = *make_set_handle<strgrps_cllctn::set_t>(ptr);
			return process(set, parameters);
		}

	private:

		inline T process(const strgrps_cllctn::set_t& set, parameter_list_t& parameters) const
		{
			for (std::size_t i = 1; i < parameters.size(); ++i)
			{
				if (set.count(to_str(string_t(parameters[i]))))
				{
					return T(1);
				}
			}

			return T(0);
		}

		strgrps_cllctn groups_;
	};

	template <typename T>
	class size final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using scalar_t = typename generic_type::scalar_view;
		using string_t = typename generic_type::string_view;
		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		size(groups_collection<std::string>& groups)
			: exprtk::igeneric_function<T>("T")
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (parameter_list_t parameters) override
		{
			auto ptr = scalar_t(parameters[0])();
			assert(ptr != T(0));
			const auto& set = *make_set_handle<strgrps_cllctn::set_t>(ptr);
			return T(set.size());
		}

	private:

		strgrps_cllctn groups_;
	};

	template <typename T>
	class get final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using scalar_t = typename generic_type::scalar_view;
		using string_t = typename generic_type::string_view;
		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		get(groups_collection<std::string>& groups)
			: igfun_t("TT", igfun_t::e_rtrn_string)
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (std::string& result, parameter_list_t parameters) override
		{
			const auto ptr = scalar_t(parameters[0])();
			const int index = static_cast<int>(scalar_t(parameters[1])());

			assert(ptr != T(0));

			auto& set = *make_set_handle<strgrps_cllctn::set_t>(ptr);

			if (
				(index >= 0) &&
				(static_cast<std::size_t>(index) >= set.size())
				)
			{
				return T(0);
			}

			auto itr = set.begin();
			std::advance(itr, index);
			result = *itr;
			return T(1);
		}

	private:

		strgrps_cllctn groups_;
	};

	template <typename T>
	class erase final : public exprtk::igeneric_function<T>
	{
	public:

		using igfun_t = typename exprtk::igeneric_function<T>;
		using parameter_list_t = typename igfun_t::parameter_list_t;
		using generic_type = typename igfun_t::generic_type;
		using scalar_t = typename generic_type::scalar_view;
		using string_t = typename generic_type::string_view;
		using strgrps_cllctn = groups_collection<std::string>;

		using exprtk::igeneric_function<T>::operator();

		erase(groups_collection<std::string>& groups)
			: exprtk::igeneric_function<T>("TS*")
			, groups_(groups)
		{
			//exprtk::rtl::io::file::details::perform_check<T>();
		}

		inline T operator() (parameter_list_t parameters) override
		{
			auto ptr = scalar_t(parameters[0])();
			assert(ptr != T(0));
			auto& set = *make_set_handle<strgrps_cllctn::set_t>(ptr);
			return process(set, parameters);
		}

	private:

		inline T process(strgrps_cllctn::set_t& set, parameter_list_t& parameters)
		{
			std::size_t count = 0;
			for (std::size_t i = 1; i < parameters.size(); ++i)
			{
				count += set.erase(to_str(string_t(parameters[i])));
			}

			return T(count);
		}

		strgrps_cllctn groups_;
	};


} // namespace groups_impl

template <typename T>
double groups_example()
{
	using symbol_table_t = exprtk::symbol_table<T>;
	using expression_t = exprtk::expression<T>;
	using parser_t = exprtk::parser<T>;

	using strset_t = std::set<std::string>;

	strset_t girl_names;
	strset_t boy_names;

	girl_names.insert("jane");
	girl_names.insert("jill");

	boy_names.insert("jack");
	boy_names.insert("jim");
	boy_names.insert("john");

	groups_impl::groups_collection<std::string> names_groups;

	names_groups.add_group("girls", girl_names);
	names_groups.add_group("boys", boy_names);

	assert(names_groups.contains("girls"));
	assert(names_groups.contains("boys"));

	groups_impl::create  <T> group_create(names_groups);
	groups_impl::add     <T> group_add(names_groups);
	groups_impl::contains<T> group_contains(names_groups);
	groups_impl::size    <T> group_size(names_groups);
	groups_impl::get     <T> group_get(names_groups);
	groups_impl::erase   <T> group_erase(names_groups);

	exprtk::rtl::io::println<T> println;

	symbol_table_t symbol_table;
	expression_t   expression;
	parser_t       parser;

	symbol_table.add_function("create", group_create);
	symbol_table.add_function("add", group_add);
	symbol_table.add_function("contains", group_contains);
	symbol_table.add_function("size", group_size);
	symbol_table.add_function("get", group_get);
	symbol_table.add_function("erase", group_erase);
	symbol_table.add_function("println", println);

	expression.register_symbol_table(symbol_table);

	const std::string program =
		" /* Load the groups from symbol table */         "
		" var girls := create('girls');                   "
		" var boys  := create('boys' );                   "
		"                                                 "
		" if (not(girls))                                 "
		" {                                               "
		"    println('failed to create girls set!');      "
		"    return [];                                   "
		" };                                              "
		"                                                 "
		" if (not(boys))                                  "
		" {                                               "
		"    println('failed to create boys set!');       "
		"    return [];                                   "
		" };                                              "
		"                                                 "
		" var name := 'john';                             "
		"                                                 "
		" if (contains(girls, name))                      "
		" {                                               "
		"    println(name, ' in girls set');              "
		" }                                               "
		" else                                            "
		" {                                               "
		"    println(name, ' NOT in girls set');          "
		" };                                              "
		"                                                 "
		" if (contains(boys, name))                       "
		" {                                               "
		"    println(name, ' in boys set');               "
		" }                                               "
		" else                                            "
		" {                                               "
		"    println(name, ' NOT in boys set');           "
		" };                                              "
		"                                                 "
		" /* Create a group from scratch */               "
		" var pets := create('pets');                     "
		"                                                 "
		" add(pets, 'buddy');                             "
		" add(pets, 'fluffy', 'snowy');                   "
		" add(pets, 'ziggy', 'monty', 'teddy');           "
		"                                                 "
		" if (contains(pets, name))                       "
		" {                                               "
		"    println(name, ' in pets set');               "
		" }                                               "
		" else                                            "
		" {                                               "
		"    println(name, ' NOT in pets set');           "
		" };                                              "
		"                                                 "
		" if (contains(pets, name, 'fluffy'))             "
		" {                                               "
		"    println(name, ' or fluffy in pets set');     "
		" }                                               "
		" else                                            "
		" {                                               "
		"    println(name, ' or fluffy NOT in pets set'); "
		" };                                              "
		"                                                 "
		" println('List of \\'pets\\':');                 "
		"                                                 "
		" for (var i := 0; i < size(pets); i += 1)        "
		" {                                               "
		"    println('[', i ,']: ', get(pets,i));         "
		" };                                              "
		"                                                 "
		" if (erase(pets, 'fluffy', 'teddy') != 2)        "
		" {                                               "
		"    println('Failed to erase fluffy and teddy'); "
		"    return [];                                   "
		" };                                              "
		"                                                 "
		" println('List of \\'pets\\':');                 "
		"                                                 "
		" for (var i := 0; i < size(pets); i += 1)        "
		" {                                               "
		"    println('[', i ,']: ', get(pets,i));         "
		" };                                              "
		"                                                 ";

	if (!parser.compile(program, expression))
	{
		printf("Error: %s\tExpression: %s\n",
			parser.error().c_str(),
			program.c_str());
		return -1;
	}

	return expression.value();

	// Benchmark
	//{
	//   constexpr auto rounds = 100000;
	//
	//   const auto begin = std::chrono::system_clock::now();
	//   {
	//      for (std::size_t i = 0; i < rounds; ++i)
	//      {
	//         expression.value();
	//      }
	//   }
	//   const auto end = std::chrono::system_clock::now();
	//
	//   const auto total_time_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - begin).count();
	//
	//   printf("[*] total time: %5.4fsec rate: %8.4feval/sec\n",
	//          total_time_ms / 1000.0,
	//          (1000.0 * rounds) / total_time_ms);
	//}
}

template <typename T>
double groups_example2()
{
	using symbol_table_t = exprtk::symbol_table<T>;
	using expression_t = exprtk::expression<T>;
	using parser_t = exprtk::parser<T>;

	using strset_t = std::set<std::string>;

	strset_t girl_names;

	girl_names.insert("jane");
	girl_names.insert("jill");


	groups_impl::groups_collection<std::string> names_groups;

	names_groups.add_group("girls", girl_names);


	groups_impl::create  <T> group_create(names_groups);
	groups_impl::contains<T> group_contains(names_groups);

	exprtk::rtl::io::println<T> println;

	symbol_table_t symbol_table;
	expression_t   expression;
	parser_t       parser;
	std::string name = "jane";
	symbol_table.add_stringvar("name", name);
	symbol_table.add_function("create", group_create);
	symbol_table.add_function("contains", group_contains);

	expression.register_symbol_table(symbol_table);

	const std::string program =
		" /* Load the groups from symbol table */         "
		" var girls := create('girls');                   "
		"                                                 "
		"                                                 "
		" if (contains(girls, name))                      "
		" {                                               "
		"    return [true];              "
		" }                                               "
		" else                                            "
		" {                                               "
		"    return [false];          "
		" };                                              "
		"                                                 ";

	if (!parser.compile(program, expression))
	{
		printf("Error: %s\tExpression: %s\n",
			parser.error().c_str(),
			program.c_str());
		return -1;
	}

	expression.value();

	const exprtk::results_context<T>& results = expression.results();
	T result;
	results.get_scalar(0, result);
	

	// Benchmark
	//{
	//   constexpr auto rounds = 100000;
	//
	//   const auto begin = std::chrono::system_clock::now();
	//   {
	//      for (std::size_t i = 0; i < rounds; ++i)
	//      {
	//         expression.value();
	//      }
	//   }
	//   const auto end = std::chrono::system_clock::now();
	//
	//   const auto total_time_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - begin).count();
	//
	//   printf("[*] total time: %5.4fsec rate: %8.4feval/sec\n",
	//          total_time_ms / 1000.0,
	//          (1000.0 * rounds) / total_time_ms);
	//}
	return result;
}

bool test_exprtk_case() {
	CreditCalcRule rule;
	rule.assignmentGroups = "FLY";
	rule.assignments = "FLY";
	rule.isChiefPilotCredit = nullptr;
	rule.courseCode = "";
	rule.trainRole = "";
	rule.isIPOrCK = nullptr;
	rule.isChiefPilot = nullptr;
	rule.credit = "(STA-STD)/2";
	rule.multiple = 1.35f;


	exprtk::timer timer;
	timer.start();
	int count = 100000000;
	time_t sta = 1726794000;
	time_t std = 1726786800;
	exprtk::expression<double> creditExpression;
	CreditCalcRuleVariable ruleVariable;
	ruleVariable.sta = sta;
	ruleVariable.std = std;

	double x = 1000;
	exprtk::symbol_table<double> symbol_table;
	symbol_table.add_variable("STA", ruleVariable.sta);
	symbol_table.add_variable("STD", ruleVariable.std);
	symbol_table.add_variable("x", x);
	double credit = 0;
	loadCreditExpression(symbol_table, creditExpression, ruleVariable, rule.credit);
	for (int i = 0; i < count; i++) {
		ruleVariable.sta = sta + i * 1000;
		ruleVariable.std = std + i * 2;
		credit = creditExpression.value();
		//std::cout << "credit=" << credit << std::endl;
	}
	timer.stop();
	printf("[exprtk] count:%d, Total Time:%12.8f  Rate:%14.3fevals/sec\n",
		count,
		timer.time(),
		count / timer.time());
	return true;
}

bool test_exprtk_case2() {

	////std::string strExpression = "AG IN ('FLY','MVO','MPV')";
	//std::string strExpression = "AG IN ('FLY')";
	//exprtk::symbol_table<double> symbol_table;
	//std::string assignmentGroup = "G";
	//symbol_table.add_stringvar("AG", assignmentGroup);

	//exprtk::expression<double> expression;
	//expression.register_symbol_table(symbol_table);

	//exprtk::parser<double> parser;
	//parser.compile(strExpression, expression);

	//if (!parser.compile(strExpression, expression))
	//{
	//	printf("[test_exprtk_case2] - Parser Error: %s\tExpression: %s\n",
	//		parser.error().c_str(),
	//		strExpression.c_str());
	//	return false;
	//}

	//std::cout << "result=" << expression.value() << std::endl;

	//using symbol_table_t = exprtk::symbol_table<double>;
	//using expression_t = exprtk::expression<double>;
	//using parser_t = exprtk::parser<double>;

	//using strset_t = std::set<std::string>;

	//strset_t assignmentGroups;

	//assignmentGroups.insert("FLY");
	//assignmentGroups.insert("MVO");
	//assignmentGroups.insert("MPV");


	//groups_impl::groups_collection<std::string> names_groups;
	//names_groups.add_group("assignmentGroups", assignmentGroups);

	//groups_impl::contains<double> group_contains(names_groups);

	//symbol_table_t symbol_table;
	//expression_t   expression;
	//parser_t       parser;
	//
	//symbol_table.add_function("contains", group_contains);
	//std::string assignmentGroup = "FLY";
	//symbol_table.add_stringvar("assignmentGroup", assignmentGroup);

	//expression.register_symbol_table(symbol_table);

	//const std::string program = "var assignmentGroups := create('assignmentGroups'); contains(assignmentGroups, assignmentGroup);";
	//if (!parser.compile(program, expression))
	//{
	//	printf("Error: %s\tExpression: %s\n",
	//		parser.error().c_str(),
	//		program.c_str());
	//	return false;
	//}

	//std::cout << "result=" << expression.value() << std::endl;


	std::cout << "result=" << groups_example2<double>() << std::endl;
	return true;

}

bool test_exprtk_case3() {
	CreditCalcRule rule;
	rule.assignmentGroups = "FLY|MVO|MVP";
	rule.assignments = "FLY";
	rule.isChiefPilotCredit = nullptr;
	rule.courseCode = "";
	rule.trainRole = "";
	rule.isIPOrCK = nullptr;
	rule.isChiefPilot = nullptr;
	rule.credit = "(STA-STD)/2";
	rule.multiple = 1.35f;


	std::set<std::string> assignmentGroups;

	assignmentGroups.insert("FLY");
	assignmentGroups.insert("MVO");
	assignmentGroups.insert("MVP");


	groups_impl::groups_collection<std::string> names_groups;

	names_groups.add_group("assignmentGroups", assignmentGroups);


	groups_impl::create <double> group_create(names_groups);
	groups_impl::contains<double> group_contains(names_groups);

	std::string assignmentGroup = "FLY";
	exprtk::symbol_table<double> symbol_table;
	symbol_table.add_stringvar("assignmentGroup", assignmentGroup);
	symbol_table.add_function("create", group_create);
	symbol_table.add_function("contains", group_contains);

	//rule.assignmentGroups 转换成下面脚本
	const std::string ruleAssignmentGroups =
		" var assignmentGroups := create('assignmentGroups');"
		"                                                 "
		" if (contains(assignmentGroups, assignmentGroup))"
		" {                                               "
		"    return [true];                              "
		" }                                               "
		" else                                            "
		" {                                               "
		"    return [false];                              "
		" };                                              "
		"                                                 ";

	exprtk::expression<double> assignmentGroupsExpression;
	loadExpression(symbol_table, assignmentGroupsExpression, ruleAssignmentGroups);

	int count = 1000;
	exprtk::timer timer;
	timer.start();

	for (int i = 0; i < count; i++) {
		assignmentGroupsExpression.value();

		const exprtk::results_context<double>& results = assignmentGroupsExpression.results();

		double result;
		results.get_scalar(0, result);
		//std::cout << "result=" << result << std::endl;
	}

	timer.stop();
	printf("[exprtk] Total Time:%12.8f  Rate:%14.3fevals/sec\n",
		timer.time(),
		count / timer.time());

	return true;
}

#endif