export default function Card({ title, value }) {
  return (
    <div className="bg-[#1f2937] p-5 rounded-xl shadow hover:scale-105 transition">
      <p className="text-gray-400 text-sm">{title}</p>
      <h3 className="text-2xl font-bold mt-2 text-white">{value}</h3>
    </div>
  );
}
